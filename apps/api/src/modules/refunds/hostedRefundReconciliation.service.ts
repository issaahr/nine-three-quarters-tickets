import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, IsNull, MoreThan, Not } from 'typeorm';

import { getDatabaseClockTimestamp } from '../../database/databaseClock';
import { HostedCheckoutUnavailableError } from '../payments/errors/hostedCheckoutUnavailable.error';
import {
  HostedPaymentGateway,
  HostedRefundOutcome,
} from '../payments/hostedPaymentGateway.interfaces';
import {
  hostedPaymentGatewayToken,
  hostedReconciliationBatchSize,
} from '../payments/payments.constants';
import { Refund } from './refund.entity';
import { RefundStatus } from './refundStatus.enum';

// A geração precisa de precisão estável entre PostgreSQL e Date para a atualização condicional.
const refundSubmissionTimestampSql = "date_trunc('milliseconds', clock_timestamp())";

@Injectable()
export class HostedRefundReconciliationService {
  private readonly logger = new Logger(HostedRefundReconciliationService.name);
  private afterRefundId?: string;
  private batchRunning = false;

  public constructor(
    private readonly dataSource: DataSource,
    @Inject(hostedPaymentGatewayToken) private readonly gateway: HostedPaymentGateway | null,
  ) {}

  /**
   * Processa intenções de estorno persistidas. O cursor só limita a varredura, sem decidir o estado.
   *
   */
  public async reconcilePendingBatch(): Promise<void> {
    const gateway = this.gateway;
    if (!gateway || this.batchRunning) return;
    this.batchRunning = true;
    try {
      const refunds = await this.dataSource.getRepository(Refund).find({
        relations: { payment: true },
        where: {
          status: RefundStatus.Pending,
          payment: { provider: gateway.provider, externalPaymentReference: Not(IsNull()) },
          ...(this.afterRefundId ? { id: MoreThan(this.afterRefundId) } : {}),
        },
        order: { id: 'ASC' },
        take: hostedReconciliationBatchSize,
      });
      this.afterRefundId =
        refunds.length === hostedReconciliationBatchSize ? refunds.at(-1)?.id : undefined;
      await Promise.all(
        refunds.map(async (refund) => {
          try {
            await this.reconcile(gateway, refund);
          } catch {
            this.logger.warn(`Falha ao conciliar estorno hospedado ${refund.id}`);
          }
        }),
      );
    } finally {
      this.batchRunning = false;
    }
  }

  /**
   * Usa uma geração de envio persistida antes do I/O para que processos concorrentes usem a mesma chave.
   *
   * @param gateway - Adapter do provedor habilitado para executar ou consultar a operação externa.
   * @param candidate - Intenção persistida de estorno selecionada para conciliação.
   */
  private async reconcile(gateway: HostedPaymentGateway, candidate: Refund): Promise<void> {
    const repository = this.dataSource.getRepository(Refund);
    const started = await repository.update(
      { id: candidate.id, status: RefundStatus.Pending, externalStartedAt: IsNull() },
      { externalStartedAt: () => refundSubmissionTimestampSql },
    );
    const refund = await repository.findOneByOrFail({ id: candidate.id });
    if (refund.status !== RefundStatus.Pending || !refund.externalStartedAt) return;
    const { externalPaymentReference, currency, amountCents } = candidate.payment;
    if (!externalPaymentReference || amountCents !== refund.amountCents) {
      throw new HostedCheckoutUnavailableError();
    }
    const request = { refundId: refund.id, externalPaymentReference, currency, amountCents };

    let outcome = refund.externalReference
      ? await gateway.retrieveRefund(request, refund.externalReference)
      : started.affected === 1
        ? null
        : await gateway.findRefund(request);
    if (!outcome) {
      const now = await getDatabaseClockTimestamp(this.dataSource.manager);
      const submissionAge = now.getTime() - refund.externalStartedAt.getTime();
      let submissionStartedAt: Date | null = refund.externalStartedAt;
      if (submissionAge >= gateway.refundIdempotencyRetentionMs) {
        // A lista confirmou a ausência da intenção. A Stripe limita a devolução ao valor da cobrança.
        submissionStartedAt = await this.restartSubmission(refund.id, refund.externalStartedAt);
      } else if (submissionAge >= gateway.creationRetryWindowMs) {
        return;
      }
      if (!submissionStartedAt) return;
      outcome = await gateway.createRefund(request, submissionStartedAt);
    }
    await this.applyOutcome(refund, outcome);
  }

  /**
   * Renova a chave após a retenção sem competir com outro processo que já retomou ou vinculou a intenção.
   *
   * @param refundId - Identificador da intenção de estorno cuja geração será renovada condicionalmente.
   * @param priorSubmission - Geração de envio anteriormente lida, que deve continuar vigente para autorizar a renovação.
   * @returns Nova geração persistida de envio, ou null quando outra operação já alterou a intenção.
   */
  private async restartSubmission(refundId: string, priorSubmission: Date): Promise<Date | null> {
    const repository = this.dataSource.getRepository(Refund);
    const renewal = await repository.update(
      {
        id: refundId,
        status: RefundStatus.Pending,
        externalReference: IsNull(),
        externalStartedAt: priorSubmission,
      },
      { externalStartedAt: () => refundSubmissionTimestampSql },
    );
    if (renewal.affected !== 1) return null;
    const current = await repository.findOneBy({
      id: refundId,
      status: RefundStatus.Pending,
      externalReference: IsNull(),
    });
    return current?.externalStartedAt ?? null;
  }

  /**
   * Aplica a confirmação externa sob lock sem reverter um resultado terminal por uma resposta antiga.
   *
   * @param refund - Intenção persistida de estorno que será bloqueada antes de aplicar o resultado.
   * @param outcome - Referência e estado do estorno previamente consultados e validados pelo adapter.
   */
  private async applyOutcome(refund: Refund, outcome: HostedRefundOutcome): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Refund);
      const current = await repository.findOneOrFail({
        where: { id: refund.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        (current.externalReference && current.externalReference !== outcome.externalReference) ||
        current.amountCents !== refund.amountCents ||
        current.paymentId !== refund.paymentId
      ) {
        throw new HostedCheckoutUnavailableError();
      }
      if (current.status !== RefundStatus.Pending) return;
      if (outcome.status === RefundStatus.Pending && current.externalReference) return;

      const now = await getDatabaseClockTimestamp(manager);
      current.externalReference = outcome.externalReference;
      current.status = outcome.status;
      current.completedAt = outcome.status === RefundStatus.Completed ? now : null;
      current.failedAt = outcome.status === RefundStatus.Failed ? now : null;
      await repository.save(current);
    });
  }
}
