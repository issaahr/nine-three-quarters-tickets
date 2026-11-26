import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { getDatabaseClockTimestamp } from '../../database/databaseClock';
import { EventStatus } from '../events/eventStatus.enum';
import { HostedCheckoutUnavailableError } from './errors/hostedCheckoutUnavailable.error';
import { PaymentNotFoundError } from './errors/paymentNotFound.error';
import { HostedPaymentGateway } from './hostedPaymentGateway.interfaces';
import { Payment } from './payment.entity';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentStatus } from './paymentStatus.enum';
import { hostedPaymentGatewayToken } from './payments.constants';
import { HostedCheckout } from './payments.interfaces';
import { PaymentsService } from './payments.service';
import { PaymentRepository } from './repositories/payment.repository';

@Injectable()
export class HostedCheckoutService {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly paymentsService: PaymentsService,
    private readonly paymentRepository: PaymentRepository,
    @Inject(hostedPaymentGatewayToken) private readonly gateway: HostedPaymentGateway | null,
  ) {}

  /**
   * Persiste a tentativa local antes de iniciar a sessão externa.
   *
   * @param idempotencyKey - Chave reutilizada pelo cliente para repetir a mesma intenção de pagamento.
   * @returns Tentativa persistida com link quando o pagamento externo pode prosseguir.
   */
  public async start(
    customerId: string,
    reservationId: string,
    idempotencyKey: string,
    method: PaymentMethod,
  ): Promise<HostedCheckout> {
    const gateway = this.getGateway();
    const payment = await this.paymentsService.startHostedPayment(
      customerId,
      reservationId,
      idempotencyKey,
      method,
      gateway.provider,
    );
    return this.checkout(gateway, customerId, reservationId, payment.id, true);
  }

  /**
   * Consulta a tentativa visível sem criar sessão nem confirmar a compra.
   *
   * @returns Tentativa local com URL nula se o vínculo externo ainda não foi gravado.
   */
  public find(customerId: string, reservationId: string): Promise<HostedCheckout> {
    return this.checkout(this.getGateway(), customerId, reservationId, undefined, false);
  }

  /**
   * Retoma uma tentativa já persistida mesmo se o cliente perdeu a chave original.
   *
   * @param paymentId - Identidade local estável usada também para repetir a criação externa.
   */
  public resume(
    customerId: string,
    reservationId: string,
    paymentId: string,
  ): Promise<HostedCheckout> {
    return this.checkout(this.getGateway(), customerId, reservationId, paymentId, true);
  }

  /**
   * Obtém o link fora da transação e revalida a reserva antes de devolvê-lo.
   *
   * @param allowCreation - Autoriza criação idempotente ou confirmação de compra gratuita em mutações.
   */
  private async checkout(
    gateway: HostedPaymentGateway,
    customerId: string,
    reservationId: string,
    paymentId: string | undefined,
    allowCreation: boolean,
  ): Promise<HostedCheckout> {
    const payment = await this.findAttempt(gateway, customerId, reservationId, paymentId);
    const now = await getDatabaseClockTimestamp(this.dataSource.manager);
    if (!this.canCheckout(payment, now)) return { payment, checkoutUrl: null, canResume: false };

    if (payment.amountCents === 0) {
      const result = allowCreation
        ? await this.paymentsService.confirmFreeHostedPayment(customerId, payment)
        : payment;
      return { payment: result, checkoutUrl: null, canResume: !allowCreation };
    }

    const request = {
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      method: payment.method,
    };
    if (!payment.externalReference) {
      // Após a janela idempotente, repetir uma criação sem vínculo pode abrir outra sessão.
      const canResume = now.getTime() - payment.createdAt.getTime() < gateway.creationRetryWindowMs;
      if (!allowCreation) return { payment, checkoutUrl: null, canResume };
      if (!canResume) throw new HostedCheckoutUnavailableError();
    }

    const redirect = payment.externalReference
      ? await gateway.retrieveCheckout(request, payment.externalReference)
      : await gateway.createCheckout(request, this.returnUrl(reservationId));
    // Preserva a referência para conciliação mesmo se o prazo da reserva venceu durante a chamada.
    if (!payment.externalReference) {
      await this.paymentRepository.attachExternalReference(
        this.dataSource.manager,
        payment,
        redirect.externalReference,
      );
    }

    // Outra chamada pode ter gravado a referência primeiro ou a reserva pode ter expirado durante a espera.
    const current = await this.findAttempt(gateway, customerId, reservationId, payment.id);
    if (current.externalReference !== redirect.externalReference)
      throw new HostedCheckoutUnavailableError();
    const checkedAt = await getDatabaseClockTimestamp(this.dataSource.manager);
    return {
      payment: current,
      checkoutUrl: this.canCheckout(current, checkedAt) ? redirect.checkoutUrl : null,
      canResume: false,
    };
  }

  /**
   * Busca uma tentativa do titular e usa a mesma resposta para ausência e falta de acesso.
   *
   * @param paymentId - Restringe a retomada a um ID local em vez de selecionar a tentativa da reserva.
   */
  private async findAttempt(
    gateway: HostedPaymentGateway,
    customerId: string,
    reservationId: string,
    paymentId?: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepository.findHostedForCheckout(
      this.dataSource.manager,
      customerId,
      reservationId,
      gateway.provider,
      paymentId,
    );
    if (!payment) throw new PaymentNotFoundError();
    return payment;
  }

  private canCheckout(payment: Payment, now: Date): boolean {
    const reservation = payment.reservation;
    return (
      payment.status === PaymentStatus.Pending &&
      !reservation.confirmedAt &&
      !reservation.cancelledAt &&
      reservation.expiresAt > now &&
      reservation.event.status === EventStatus.Published &&
      reservation.event.startsAt > now
    );
  }

  private returnUrl(reservationId: string): string {
    return new URL(`/customer/reservations/${reservationId}`, applicationConfig.corsOrigins[0])
      .href;
  }

  private getGateway(): HostedPaymentGateway {
    if (!this.gateway) throw new PaymentNotFoundError();
    return this.gateway;
  }
}
