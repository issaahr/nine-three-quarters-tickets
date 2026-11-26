import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { Event } from '../events/event.entity';
import { EventStatus } from '../events/eventStatus.enum';
import { ReservationItem } from '../reservations/reservationItem.entity';
import { Reservation } from '../reservations/reservation.entity';
import { ReservationNotActiveError } from '../reservations/errors/reservationNotActive.error';
import { ReservationNotFoundError } from '../reservations/errors/reservationNotFound.error';
import { Payment } from './payment.entity';
import { PaymentCurrency } from './paymentCurrency.enum';
import { PaymentFinalizationService } from './paymentFinalization.service';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentProvider } from './paymentProvider.enum';
import { PaymentStatus } from './paymentStatus.enum';
import { CreateCardPaymentRequestDto } from './dto/createCardPaymentRequest.dto';
import {
  hostedCheckoutMaxStoredAmountCents,
  paymentGatewayToken,
  simulatedPixCompletionDelayMs,
} from './payments.constants';
import { CardPaymentGatewayStatus, PaymentGateway } from './paymentGateway.interfaces';
import {
  DatabaseTimestampRow,
  PaymentInitiation,
  SimulatedPixPaymentInitiation,
} from './payments.interfaces';
import { PaymentInProgressError } from './errors/paymentInProgress.error';
import { ReservationAlreadyPaidError } from './errors/reservationAlreadyPaid.error';
import { ReservationExpiredError } from './errors/reservationExpired.error';
import { UnsupportedCheckoutAmountError } from './errors/unsupportedCheckoutAmount.error';
import { HostedPaymentInitiationOptions } from './hostedPaymentGateway.interfaces';
import { PaymentNotFoundError } from './errors/paymentNotFound.error';
import { PaymentRepository } from './repositories/payment.repository';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  public constructor(
    private readonly dataSource: DataSource,
    private readonly paymentRepository: PaymentRepository,
    @Inject(paymentGatewayToken) private readonly paymentGateway: PaymentGateway,
    private readonly paymentFinalization: PaymentFinalizationService,
  ) {}

  /**
   * Persiste uma tentativa PENDING com exclusividade por Reservation antes do processamento externo.
   *
   * A Reservation é bloqueada antes de recuperar órfãos, resolver a idempotency key e criar
   * uma nova tentativa. A constraint parcial de Payment permanece como proteção estrutural
   * caso exista outro caminho concorrente de escrita no banco.
   *
   * @param customerId - Identidade do CUSTOMER autenticado que deve possuir a Reservation.
   * @param reservationId - Reservation que será paga.
   * @param idempotencyKey - UUID estável durante retries técnicos da mesma tentativa.
   * @param card - Dados transitórios validados, encaminhados ao gateway após o commit do PENDING.
   * @returns Payment existente para a mesma chave ou resultado do processamento da nova tentativa.
   */
  public async processCardPayment(
    customerId: string,
    reservationId: string,
    idempotencyKey: string,
    card: CreateCardPaymentRequestDto,
  ): Promise<Payment> {
    const initiation = await this.startPayment(
      customerId,
      reservationId,
      idempotencyKey,
      PaymentMethod.Card,
    );

    if (!initiation.created) {
      return initiation.payment;
    }

    let gatewayStatus: CardPaymentGatewayStatus;

    try {
      const gatewayResult = await this.paymentGateway.processCard({
        cardNumber: card.cardNumber,
        cardholderName: card.cardholderName,
        expiry: card.expiry,
        cvv: card.cvv,
        amountCents: initiation.payment.amountCents,
      });
      gatewayStatus = gatewayResult.status;
    } catch (error) {
      this.logger.error(
        `Falha técnica ao processar pagamento ${initiation.payment.id}`,
        error instanceof Error ? error.stack : undefined,
      );

      return this.paymentFinalization.failPayment(initiation.payment.id);
    }

    const outcome =
      gatewayStatus === CardPaymentGatewayStatus.Approved
        ? PaymentStatus.Approved
        : PaymentStatus.Declined;

    return this.paymentFinalization.finalizePayment(initiation.payment.id, outcome);
  }

  /**
   * Persiste a tentativa de PIX com o instante de conclusão calculado pelo relógio do PostgreSQL.
   * O conteúdo do QR simulado deriva do identificador persistido, de modo que o retry é estável.
   *
   * @param customerId - Identidade do CUSTOMER que deve possuir a Reservation.
   * @param reservationId - Reservation cuja tentativa de pagamento será persistida.
   * @param idempotencyKey - Chave estável da tentativa, compartilhada entre os métodos por Reservation.
   * @returns Payment original ou recém-criado. O QR só acompanha um Payment de PIX.
   */
  public async createSimulatedPixPayment(
    customerId: string,
    reservationId: string,
    idempotencyKey: string,
  ): Promise<SimulatedPixPaymentInitiation> {
    const { payment } = await this.startPayment(
      customerId,
      reservationId,
      idempotencyKey,
      PaymentMethod.Pix,
    );

    return this.toSimulatedPixPayment(payment);
  }

  /**
   * Grava ou recupera a tentativa cuja identidade será usada na chamada ao provedor.
   *
   * @param customerId - Identidade autenticada do cliente que deve possuir a reserva.
   * @param reservationId - Identificador da reserva à qual a tentativa deve pertencer.
   * @param idempotencyKey - Chave compartilhada entre os métodos da reserva para recuperar a mesma tentativa.
   * @param method - Meio de pagamento solicitado para a tentativa local.
   * @param hosted - Provedor e URL de retorno a preservar antes de iniciar cobrança de valor positivo.
   * @returns Tentativa com total calculado pelos itens persistidos e indicação de criação nesta chamada.
   */
  public async startHostedPayment(
    customerId: string,
    reservationId: string,
    idempotencyKey: string,
    method: PaymentMethod,
    hosted: HostedPaymentInitiationOptions,
  ): Promise<PaymentInitiation> {
    return this.startPayment(customerId, reservationId, idempotencyKey, method, hosted);
  }

  /**
   * Confirma uma compra gratuita pela mesma finalização transacional usada no fluxo local.
   *
   * @param customerId - Titular da reserva, revalidado na liquidação local de PIX.
   * @param payment - Tentativa persistida com provedor fake e valor zero.
   * @returns Tentativa gratuita após finalização local, sujeita à revalidação do prazo e da disponibilidade.
   */
  public confirmFreeHostedPayment(customerId: string, payment: Payment): Promise<Payment> {
    if (payment.provider !== PaymentProvider.Fake || payment.amountCents !== 0) {
      throw new PaymentNotFoundError();
    }
    return payment.method === PaymentMethod.Pix
      ? this.paymentFinalization.settleSimulatedPixPayment(
          customerId,
          payment.reservationId,
          payment.id,
        )
      : this.paymentFinalization.finalizePayment(payment.id, PaymentStatus.Approved);
  }

  /**
   * Recupera o PIX ativo do dono da Reservation ou, na ausência dele, o resultado mais recente.
   *
   * @param customerId - Identidade do CUSTOMER autenticado.
   * @param reservationId - Reservation cujo checkout está sendo retomado.
   * @returns Payment e conteúdo do QR reconstruído a partir do identificador persistido.
   */
  public async findSimulatedPixForCheckout(
    customerId: string,
    reservationId: string,
  ): Promise<SimulatedPixPaymentInitiation> {
    const payment = await this.paymentRepository.findSimulatedPixForCheckout(
      this.dataSource.manager,
      customerId,
      reservationId,
    );

    if (!payment) {
      throw new PaymentNotFoundError();
    }

    return this.toSimulatedPixPayment(payment);
  }

  /**
   * Solicita a conclusão da tentativa identificada pelo checkout, permitindo retries sem nova compra.
   *
   * @param customerId - Identidade do CUSTOMER que deve possuir a Reservation.
   * @param reservationId - Reservation apresentada no checkout.
   * @param paymentId - Tentativa de PIX que deve pertencer à Reservation.
   * @returns Tentativa ainda PENDING antes do prazo ou o resultado terminal persistido.
   */
  public async settleSimulatedPixPayment(
    customerId: string,
    reservationId: string,
    paymentId: string,
  ): Promise<SimulatedPixPaymentInitiation> {
    const payment = await this.paymentFinalization.settleSimulatedPixPayment(
      customerId,
      reservationId,
      paymentId,
    );
    return this.toSimulatedPixPayment(payment);
  }

  private toSimulatedPixPayment(payment: Payment): SimulatedPixPaymentInitiation {
    return {
      payment,
      qrCodePayload:
        payment.provider === PaymentProvider.Fake && payment.method === PaymentMethod.Pix
          ? `ntq:pix:simulado:${payment.id}`
          : null,
    };
  }

  /**
   * Serializa a criação de tentativas de cartão e PIX pelo lock da Reservation.
   * A busca da chave precede a validação de nova tentativa, para preservar retries do Payment original.
   *
   * @param customerId - Identidade do CUSTOMER autenticado que deve possuir a Reservation.
   * @param reservationId - Reservation que será paga.
   * @param idempotencyKey - UUID estável durante retries técnicos da mesma tentativa.
   * @param method - Método usado quando a chave ainda não possui um Payment.
   * @param hosted - Dados do fluxo hospedado; quando ausentes, mantém o processamento local fake.
   * @returns Tentativa e indicação de criação, distinguindo uma nova intenção de um retry idempotente.
   */
  private async startPayment(
    customerId: string,
    reservationId: string,
    idempotencyKey: string,
    method: PaymentMethod,
    hosted?: HostedPaymentInitiationOptions,
  ): Promise<PaymentInitiation> {
    return this.dataSource.transaction(async (manager) => {
      const reservationsRepository = manager.getRepository(Reservation);
      const reservationItemsRepository = manager.getRepository(ReservationItem);
      const reservation = await reservationsRepository.findOne({
        where: { id: reservationId, customerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) {
        throw new ReservationNotFoundError();
      }

      const now = await this.getDatabaseTimestamp(manager);
      const staleBefore = new Date(
        now.getTime() - applicationConfig.payments.cardPendingTimeoutSeconds * 1000,
      );
      const orphanedPayments = await this.paymentRepository.expireOrphanedFakeCardPayments(
        manager,
        reservation.id,
        staleBefore,
        now,
      );

      if (orphanedPayments.affected) {
        this.logger.warn(
          `Pagamentos de cartão órfãos recuperados para Reservation ${reservation.id}`,
        );
      }

      const idempotentPayment = await this.paymentRepository.findByReservationAndIdempotencyKey(
        manager,
        reservation.id,
        idempotencyKey,
      );

      if (idempotentPayment) {
        return { payment: idempotentPayment, created: false };
      }

      const activePayment = await this.paymentRepository.findActiveByReservation(
        manager,
        reservation.id,
      );

      if (activePayment?.status === PaymentStatus.Pending) {
        throw new PaymentInProgressError();
      }

      if (activePayment?.status === PaymentStatus.Approved || reservation.confirmedAt) {
        throw new ReservationAlreadyPaidError();
      }

      if (reservation.cancelledAt) {
        throw new ReservationNotActiveError();
      }

      if (reservation.expiresAt.getTime() <= now.getTime()) {
        throw new ReservationExpiredError();
      }

      // Evita iniciar uma cobrança externa para uma ocorrência que já saiu de venda.
      if (hosted) {
        const event = await manager
          .getRepository(Event)
          .findOneByOrFail({ id: reservation.eventId });
        if (event.status !== EventStatus.Published || event.startsAt <= now) {
          throw new ReservationNotActiveError();
        }
      }

      const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
      const amountCents = items.reduce((total, item) => total + item.unitPriceCents, 0);
      const currency = PaymentCurrency.Brl;
      const paidCheckout = amountCents > 0 ? hosted : undefined;
      if (paidCheckout) {
        if (amountCents > hostedCheckoutMaxStoredAmountCents)
          throw new UnsupportedCheckoutAmountError();
        paidCheckout.gateway.assertCheckoutAmount(amountCents, currency, method);
      }
      const resolvedProvider = paidCheckout?.gateway.provider ?? PaymentProvider.Fake;
      const paymentsRepository = manager.getRepository(Payment);

      const payment = await paymentsRepository.save(
        paymentsRepository.create({
          reservationId: reservation.id,
          method,
          provider: resolvedProvider,
          status: PaymentStatus.Pending,
          idempotencyKey,
          amountCents,
          currency,
          externalReference: null,
          checkoutReturnUrl: paidCheckout?.returnUrl ?? null,
          approvedAt: null,
          failedAt: null,
          simulationCompletionAt:
            resolvedProvider === PaymentProvider.Fake && method === PaymentMethod.Pix
              ? new Date(now.getTime() + (hosted ? 0 : simulatedPixCompletionDelayMs))
              : null,
        }),
      );

      return { payment, created: true };
    });
  }

  /**
   * Lê o relógio do PostgreSQL após o lock, pois o prazo da Reservation pode vencer durante a espera.
   *
   * @param manager - Manager vinculado à transação que utilizará o timestamp.
   * @returns Instante atual calculado pelo PostgreSQL.
   */
  private async getDatabaseTimestamp(manager: EntityManager): Promise<Date> {
    const timestampRows = (await manager.query(
      'SELECT clock_timestamp() AS "now"',
    )) as DatabaseTimestampRow[];

    return new Date(timestampRows[0].now);
  }
}
