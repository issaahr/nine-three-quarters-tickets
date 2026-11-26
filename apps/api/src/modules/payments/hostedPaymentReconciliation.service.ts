import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource, MoreThan, Not, IsNull } from 'typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { getDatabaseClockTimestamp } from '../../database/databaseClock';
import { EventStatus } from '../events/eventStatus.enum';
import { HostedRefundReconciliationService } from '../refunds/hostedRefundReconciliation.service';
import { Reservation } from '../reservations/reservation.entity';
import { HostedCheckoutUnavailableError } from './errors/hostedCheckoutUnavailable.error';
import { HostedPaymentGateway, HostedPaymentRequest } from './hostedPaymentGateway.interfaces';
import { HostedPaymentOutcomeStatus } from './hostedPaymentOutcomeStatus.enum';
import { Payment } from './payment.entity';
import { PaymentFinalizationService } from './paymentFinalization.service';
import { PaymentProvider } from './paymentProvider.enum';
import { PaymentStatus } from './paymentStatus.enum';
import {
  hostedPaymentGatewayToken,
  hostedReconciliationBatchSize,
  hostedReconciliationIntervalMs,
} from './payments.constants';

interface ReconciliationBatchProgress {
  afterPaymentId?: string;
  running: boolean;
}

@Injectable()
export class HostedPaymentReconciliationService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HostedPaymentReconciliationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly linked: ReconciliationBatchProgress = { running: false };
  private readonly unlinked: ReconciliationBatchProgress = { running: false };

  public constructor(
    private readonly dataSource: DataSource,
    private readonly finalization: PaymentFinalizationService,
    private readonly refunds: HostedRefundReconciliationService,
    @Inject(hostedPaymentGatewayToken) private readonly gateway: HostedPaymentGateway | null,
  ) {}

  public onApplicationBootstrap(): void {
    if (applicationConfig.payments.provider !== PaymentProvider.Stripe) return;
    this.timer = setInterval(() => {
      void this.reconcilePendingBatch().catch(() =>
        this.logger.warn('Falha ao buscar pagamentos hospedados pendentes'),
      );
      void this.refunds
        .reconcilePendingBatch()
        .catch(() => this.logger.warn('Falha ao buscar estornos hospedados pendentes'));
    }, hostedReconciliationIntervalMs);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * Consulta o estado atual indicado pela notificação e conclui a transação antes do ACK.
   *
   * @param paymentId - Identificador obrigatório da tentativa local informado pela notificação autenticada.
   * @param externalReference - Identificador da sessão no provedor, validado contra a tentativa local.
   */
  public async reconcileNotification(paymentId: string, externalReference: string): Promise<void> {
    if (!this.gateway) return;
    const payment = await this.dataSource.getRepository(Payment).findOneBy({
      id: paymentId,
      provider: this.gateway.provider,
    });
    // A conta de teste pode receber eventos de outras aplicações.
    if (!payment) return;
    await this.reconcile(this.gateway, payment, externalReference);
  }

  /**
   * Revisa o estado persistido em lotes sem depender do cliente ou da entrega de webhooks.
   * O cursor só limita a varredura. Uma falha ou reinício não altera a situação da tentativa no banco.
   *
   */
  public async reconcilePendingBatch(): Promise<void> {
    const gateway = this.gateway;
    if (!gateway) return;
    await Promise.all([
      this.reconcileBatch(gateway, this.linked),
      this.reconcileBatch(gateway, this.unlinked),
    ]);
  }

  /**
   * Uma busca de sessão órfã lenta não impede a conciliação das tentativas já vinculadas.
   *
   * @param gateway - Adapter do provedor habilitado para executar ou consultar a operação externa.
   * @param progress - Cursor e indicador de execução do lote de tentativas vinculadas ou ainda sem sessão conhecida.
   */
  private async reconcileBatch(
    gateway: HostedPaymentGateway,
    progress: ReconciliationBatchProgress,
  ): Promise<void> {
    if (progress.running) return;
    progress.running = true;
    try {
      const payments = await this.dataSource.getRepository(Payment).find({
        where: {
          provider: gateway.provider,
          status: PaymentStatus.Pending,
          externalReference: progress === this.linked ? Not(IsNull()) : IsNull(),
          ...(progress.afterPaymentId ? { id: MoreThan(progress.afterPaymentId) } : {}),
        },
        order: { id: 'ASC' },
        take: hostedReconciliationBatchSize,
      });
      progress.afterPaymentId =
        payments.length === hostedReconciliationBatchSize ? payments.at(-1)?.id : undefined;
      await Promise.all(
        payments.map(async (payment) => {
          try {
            const reference =
              payment.externalReference ??
              (await gateway.findCheckout(this.request(payment), payment.createdAt))
                ?.externalReference;
            if (reference) await this.reconcile(gateway, payment, reference);
          } catch {
            this.logger.warn(`Falha ao conciliar pagamento hospedado ${payment.id}`);
          }
        }),
      );
    } finally {
      progress.running = false;
    }
  }

  /**
   * A consulta remota sempre antecede os locks transacionais da finalização.
   *
   * @param gateway - Adapter do provedor habilitado para executar ou consultar a operação externa.
   * @param payment - Tentativa persistida cujos dados delimitam a operação.
   * @param externalReference - Identificador da sessão no provedor, validado contra a tentativa local.
   */
  private async reconcile(
    gateway: HostedPaymentGateway,
    payment: Payment,
    externalReference: string,
  ): Promise<void> {
    if (payment.externalReference && payment.externalReference !== externalReference) {
      throw new HostedCheckoutUnavailableError();
    }
    const request = this.request(payment);
    const outcome = await gateway.retrievePaymentOutcome(request, externalReference);
    const current = await this.finalization.finalizeHostedPayment({
      request,
      provider: gateway.provider,
      externalReference,
      outcome,
    });
    if (
      current.status === PaymentStatus.Pending &&
      outcome.status === HostedPaymentOutcomeStatus.Pending &&
      outcome.canExpire &&
      (await this.checkoutExpired(current.reservationId))
    ) {
      // O vínculo já está durável mesmo se a expiração sofrer timeout ou chegar após uma cobrança.
      const afterExpiration = await gateway.expireCheckout(request, externalReference);
      await this.finalization.finalizeHostedPayment({
        request,
        provider: gateway.provider,
        externalReference,
        outcome: afterExpiration,
      });
    }
  }

  private request(payment: Payment): HostedPaymentRequest {
    return {
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      method: payment.method,
    };
  }

  /**
   * Usa os prazos persistidos para decidir se uma sessão aberta deve ser encerrada.
   *
   * @param reservationId - Identificador da reserva à qual a tentativa deve pertencer.
   * @returns true quando o prazo persistido ou o estado da reserva e do evento impedem continuar o checkout.
   */
  private async checkoutExpired(reservationId: string): Promise<boolean> {
    const reservation = await this.dataSource.getRepository(Reservation).findOneOrFail({
      where: { id: reservationId },
      relations: { event: true },
    });
    const now = await getDatabaseClockTimestamp(this.dataSource.manager);
    return (
      reservation.cancelledAt !== null ||
      reservation.expiresAt <= now ||
      reservation.event.status !== EventStatus.Published ||
      reservation.event.startsAt <= now
    );
  }
}
