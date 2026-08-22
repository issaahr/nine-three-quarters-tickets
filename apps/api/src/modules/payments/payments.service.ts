import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { Event } from '../events/event.entity';
import { EventSeat } from '../events/eventSeat.entity';
import { ReservationItem } from '../reservations/reservationItem.entity';
import { Reservation } from '../reservations/reservation.entity';
import { ReservationNotActiveError } from '../reservations/errors/reservationNotActive.error';
import { ReservationNotFoundError } from '../reservations/errors/reservationNotFound.error';
import { Payment } from './payment.entity';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentStatus } from './paymentStatus.enum';
import { CreateCardPaymentRequestDto } from './dto/createCardPaymentRequest.dto';
import { paymentGatewayToken } from './payments.constants';
import { CardPaymentGatewayStatus, PaymentGateway } from './paymentGateway.interfaces';
import { PaymentInProgressError } from './errors/paymentInProgress.error';
import { ReservationAlreadyPaidError } from './errors/reservationAlreadyPaid.error';
import { ReservationExpiredError } from './errors/reservationExpired.error';
import { PaymentRepository } from './repositories/payment.repository';
import { TicketsService } from '../tickets/tickets.service';

interface DatabaseTimestampRow {
  now: Date;
}

interface PaymentInitiation {
  payment: Payment;
  shouldProcess: boolean;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  public constructor(
    private readonly dataSource: DataSource,
    private readonly paymentRepository: PaymentRepository,
    @Inject(paymentGatewayToken) private readonly paymentGateway: PaymentGateway,
    private readonly ticketsService: TicketsService,
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
   * @returns Payment existente para a mesma chave ou novo Payment PENDING persistido.
   */
  public async processCardPayment(
    customerId: string,
    reservationId: string,
    idempotencyKey: string,
    card: CreateCardPaymentRequestDto,
  ): Promise<Payment> {
    const initiation = await this.startCardPayment(customerId, reservationId, idempotencyKey);

    if (!initiation.shouldProcess) {
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

      return this.failPayment(initiation.payment.id);
    }

    return this.finalizePayment(initiation.payment.id, gatewayStatus);
  }

  /**
   * Cria ou recupera a tentativa PENDING que representa uma intenção de pagamento.
   *
   * @param customerId - Identidade do CUSTOMER autenticado que deve possuir a Reservation.
   * @param reservationId - Reservation que será paga.
   * @param idempotencyKey - UUID estável durante retries técnicos da mesma tentativa.
   * @returns Payment e indicação de que somente a request criadora deve chamar o gateway.
   */
  private async startCardPayment(
    customerId: string,
    reservationId: string,
    idempotencyKey: string,
  ): Promise<PaymentInitiation> {
    return this.dataSource.transaction(async (manager) => {
      const reservationsRepository = manager.getRepository(Reservation);
      const reservationItemsRepository = manager.getRepository(ReservationItem);
      const now = await this.getDatabaseTimestamp(manager);
      const reservation = await reservationsRepository.findOne({
        where: { id: reservationId, customerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) {
        throw new ReservationNotFoundError();
      }

      const staleBefore = new Date(
        now.getTime() - applicationConfig.payments.cardPendingTimeoutSeconds * 1000,
      );
      const orphanedPayments = await this.paymentRepository.expireOrphanedPending(
        manager,
        reservation.id,
        staleBefore,
        now,
      );

      if (orphanedPayments.affected) {
        this.logger.warn(`Payments PENDING órfãos recuperados para Reservation ${reservation.id}`);
      }

      const idempotentPayment = await this.paymentRepository.findByReservationAndIdempotencyKey(
        manager,
        reservation.id,
        idempotencyKey,
      );

      if (idempotentPayment) {
        return { payment: idempotentPayment, shouldProcess: false };
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

      const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
      const amountCents = items.reduce((total, item) => total + item.unitPriceCents, 0);
      const paymentsRepository = manager.getRepository(Payment);

      const payment = await paymentsRepository.save(
        paymentsRepository.create({
          reservationId: reservation.id,
          method: PaymentMethod.Card,
          status: PaymentStatus.Pending,
          idempotencyKey,
          amountCents,
          approvedAt: null,
          failedAt: null,
        }),
      );

      return { payment, shouldProcess: true };
    });
  }

  /**
   * Finaliza uma tentativa PENDING depois que o gateway respondeu fora de transaction.
   *
   * @param paymentId - Payment originalmente persistido como PENDING.
   * @param gatewayStatus - Resultado determinístico devolvido pelo gateway.
   * @returns Payment em estado terminal após a revalidação autoritativa da Reservation.
   */
  private async finalizePayment(
    paymentId: string,
    gatewayStatus: CardPaymentGatewayStatus,
  ): Promise<Payment> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const paymentsRepository = manager.getRepository(Payment);
        const reservationsRepository = manager.getRepository(Reservation);
        const reservationItemsRepository = manager.getRepository(ReservationItem);
        const eventSeatsRepository = manager.getRepository(EventSeat);
        const eventsRepository = manager.getRepository(Event);
        const payment = await paymentsRepository.findOne({
          where: { id: paymentId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!payment || payment.status !== PaymentStatus.Pending) {
          return payment!;
        }

        const now = await this.getDatabaseTimestamp(manager);

        if (gatewayStatus === CardPaymentGatewayStatus.Declined) {
          payment.status = PaymentStatus.Declined;
          return paymentsRepository.save(payment);
        }

        const reservation = await reservationsRepository.findOne({
          where: { id: payment.reservationId },
          lock: { mode: 'pessimistic_write' },
        });
        const event = reservation
          ? await eventsRepository.findOneBy({ id: reservation.eventId })
          : null;

        if (
          !reservation ||
          reservation.confirmedAt ||
          reservation.cancelledAt ||
          reservation.expiresAt.getTime() <= now.getTime() ||
          !event ||
          event.startsAt.getTime() <= now.getTime()
        ) {
          payment.status = PaymentStatus.Failed;
          payment.failedAt = now;
          this.logger.warn(
            `Payment ${payment.id} aprovado pelo gateway não pôde confirmar a Reservation`,
          );
          return paymentsRepository.save(payment);
        }

        const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
        const soldSeats = await eventSeatsRepository
          .createQueryBuilder()
          .update(EventSeat)
          .set({ soldAt: now, holdReservationId: null, holdExpiresAt: null })
          .where('"holdReservationId" = :reservationId', { reservationId: reservation.id })
          .andWhere('"holdExpiresAt" > :now', { now })
          .andWhere('"soldAt" IS NULL')
          .execute();

        if (soldSeats.affected !== items.length) {
          throw new PaymentCompletionConflictError();
        }

        reservation.confirmedAt = now;
        payment.status = PaymentStatus.Approved;
        payment.approvedAt = now;
        await reservationsRepository.save(reservation);
        await this.ticketsService.issueForReservationItems(
          manager,
          items.map((item) => item.id),
          now,
        );

        return paymentsRepository.save(payment);
      });
    } catch (error) {
      if (!(error instanceof PaymentCompletionConflictError)) {
        throw error;
      }

      this.logger.warn(`Pagamento ${paymentId} perdeu o hold antes da confirmação`);
      return this.failPayment(paymentId);
    }
  }

  /**
   * Finaliza um Payment ainda pendente após erro técnico ou conflito de confirmação.
   *
   * @param paymentId - Payment que não pode mais confirmar a Reservation.
   * @returns Payment terminal, preservando estados já finalizados por outra request.
   */
  private async failPayment(paymentId: string): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const paymentsRepository = manager.getRepository(Payment);
      const payment = await paymentsRepository.findOne({
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment || payment.status !== PaymentStatus.Pending) {
        return payment!;
      }

      payment.status = PaymentStatus.Failed;
      payment.failedAt = await this.getDatabaseTimestamp(manager);
      return paymentsRepository.save(payment);
    });
  }

  /**
   * Obtém o instante autoritativo da conexão PostgreSQL da transação atual.
   *
   * @param manager - Manager vinculado à transação que utilizará o timestamp.
   * @returns Instante atual calculado pelo PostgreSQL.
   */
  private async getDatabaseTimestamp(manager: EntityManager): Promise<Date> {
    const timestampRows = (await manager.query(
      'SELECT CURRENT_TIMESTAMP AS "now"',
    )) as DatabaseTimestampRow[];

    return new Date(timestampRows[0].now);
  }
}

class PaymentCompletionConflictError extends Error {}
