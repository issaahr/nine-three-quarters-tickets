import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource, MoreThan, Not, IsNull } from 'typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { HostedCheckoutUnavailableError } from './errors/hostedCheckoutUnavailable.error';
import { HostedPaymentGateway } from './hostedPaymentGateway.interfaces';
import { Payment } from './payment.entity';
import { PaymentFinalizationService } from './paymentFinalization.service';
import { PaymentProvider } from './paymentProvider.enum';
import { PaymentStatus } from './paymentStatus.enum';
import {
  hostedPaymentGatewayToken,
  hostedReconciliationBatchSize,
  hostedReconciliationIntervalMs,
} from './payments.constants';

@Injectable()
export class HostedPaymentReconciliationService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HostedPaymentReconciliationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private afterPaymentId?: string;
  private batchRunning = false;

  public constructor(
    private readonly dataSource: DataSource,
    private readonly finalization: PaymentFinalizationService,
    @Inject(hostedPaymentGatewayToken) private readonly gateway: HostedPaymentGateway | null,
  ) {}

  public onApplicationBootstrap(): void {
    if (applicationConfig.payments.provider !== PaymentProvider.Stripe) return;
    this.timer = setInterval(() => {
      void this.reconcilePendingBatch().catch(() =>
        this.logger.warn('Falha ao buscar pagamentos hospedados pendentes'),
      );
    }, hostedReconciliationIntervalMs);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Consulta o estado atual indicado pela notificação e conclui a transação antes do ACK. */
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
   */
  public async reconcilePendingBatch(): Promise<void> {
    const gateway = this.gateway;
    if (!gateway || this.batchRunning) return;
    this.batchRunning = true;
    try {
      const payments = await this.dataSource.getRepository(Payment).find({
        where: {
          provider: gateway.provider,
          status: PaymentStatus.Pending,
          externalReference: Not(IsNull()),
          ...(this.afterPaymentId ? { id: MoreThan(this.afterPaymentId) } : {}),
        },
        order: { id: 'ASC' },
        take: hostedReconciliationBatchSize,
      });
      this.afterPaymentId =
        payments.length === hostedReconciliationBatchSize ? payments.at(-1)?.id : undefined;
      await Promise.all(
        payments.map(async (payment) => {
          try {
            if (payment.externalReference)
              await this.reconcile(gateway, payment, payment.externalReference);
          } catch {
            this.logger.warn(`Falha ao conciliar pagamento hospedado ${payment.id}`);
          }
        }),
      );
    } finally {
      this.batchRunning = false;
    }
  }

  /** A consulta remota sempre antecede os locks transacionais da finalização. */
  private async reconcile(
    gateway: HostedPaymentGateway,
    payment: Payment,
    externalReference: string,
  ): Promise<void> {
    if (payment.externalReference && payment.externalReference !== externalReference) {
      throw new HostedCheckoutUnavailableError();
    }
    const request = {
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      method: payment.method,
    };
    const outcome = await gateway.retrievePaymentOutcome(request, externalReference);
    await this.finalization.finalizeHostedPayment({
      request,
      provider: gateway.provider,
      externalReference,
      outcome,
    });
  }
}
