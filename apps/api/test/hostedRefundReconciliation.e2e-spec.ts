import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { EventsService } from '../src/modules/events/events.service';
import { HostedCheckoutUnavailableError } from '../src/modules/payments/errors/hostedCheckoutUnavailable.error';
import { PaymentCurrency } from '../src/modules/payments/paymentCurrency.enum';
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import { HostedRefundReconciliationService } from '../src/modules/refunds/hostedRefundReconciliation.service';
import { RefundStatus } from '../src/modules/refunds/refundStatus.enum';
import { PaymentsTestContext } from './support/paymentsTestContext';

describe('Hosted refund reconciliation', () => {
  const context = new PaymentsTestContext();

  it('retoma o mesmo estorno após timeout e consulta a confirmação sem repetir o POST após a retenção', async () => {
    const reservation = await context.createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await context.createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    const refundReference = `pyr_${randomUUID()}`;
    context.reportHostedPaymentAsPaid(payment.id, externalPaymentReference);
    await context.sendHostedNotification(payment.id, externalReference).expect(204);
    await context.sendHostedNotification(payment.id, externalReference).expect(204);
    const refund = await context.refundsRepository.findOneByOrFail({ paymentId: payment.id });

    context.hostedGateway.createRefund.mockRejectedValueOnce(new HostedCheckoutUnavailableError());
    await context.refundReconciliation.reconcilePendingBatch();
    const attempted = await context.refundsRepository.findOneByOrFail({ id: refund.id });
    expect(attempted).toMatchObject({
      status: RefundStatus.Pending,
      externalReference: null,
      externalStartedAt: expect.any(Date),
      completedAt: null,
    });
    expect(context.hostedGateway.createRefund).toHaveBeenCalledWith(
      {
        refundId: refund.id,
        externalPaymentReference,
        amountCents: payment.amountCents,
        currency: PaymentCurrency.Brl,
      },
      attempted.externalStartedAt,
    );

    const restarted = new HostedRefundReconciliationService(
      context.dataSource,
      context.hostedGateway,
    );
    await context.refundsRepository.update(refund.id, {
      externalStartedAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    context.hostedGateway.findRefund.mockResolvedValueOnce({
      externalReference: refundReference,
      status: RefundStatus.Pending,
    });
    await restarted.reconcilePendingBatch();
    await expect(
      context.refundsRepository.findOneByOrFail({ id: refund.id }),
    ).resolves.toMatchObject({
      status: RefundStatus.Pending,
      externalReference: refundReference,
      completedAt: null,
    });

    context.hostedGateway.retrieveRefund.mockResolvedValueOnce({
      externalReference: refundReference,
      status: RefundStatus.Completed,
    });
    await restarted.reconcilePendingBatch();
    await expect(context.refundsRepository.findBy({ paymentId: payment.id })).resolves.toEqual([
      expect.objectContaining({
        id: refund.id,
        status: RefundStatus.Completed,
        completedAt: expect.any(Date),
        failedAt: null,
      }),
    ]);
    expect(context.hostedGateway.createRefund).toHaveBeenCalledTimes(1);
    await expect(
      context.app
        .get(EventsService)
        .findOrganizerEventById(context.organizer.id, reservation.eventId),
    ).resolves.toMatchObject({
      soldTickets: 0,
      revenueCents: 0,
    });
  });

  it('recupera o POST com a mesma chave no retry e renova após retenção com ausência comprovada', async () => {
    const reservation = await context.createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await context.createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    context.reportHostedPaymentAsPaid(payment.id, externalPaymentReference);
    await context.sendHostedNotification(payment.id, externalReference).expect(204);
    const refund = await context.refundsRepository.findOneByOrFail({ paymentId: payment.id });
    const request = {
      refundId: refund.id,
      externalPaymentReference,
      amountCents: payment.amountCents,
      currency: PaymentCurrency.Brl,
    };
    const refundReference = `pyr_${randomUUID()}`;
    context.hostedGateway.createRefund.mockRejectedValue(new HostedCheckoutUnavailableError());
    context.hostedGateway.findRefund.mockResolvedValue(null);

    await context.refundReconciliation.reconcilePendingBatch();
    const first = await context.refundsRepository.findOneByOrFail({ id: refund.id });
    const restarted = new HostedRefundReconciliationService(
      context.dataSource,
      context.hostedGateway,
    );
    await restarted.reconcilePendingBatch();
    expect(context.hostedGateway.createRefund).toHaveBeenNthCalledWith(
      1,
      request,
      first.externalStartedAt,
    );
    expect(context.hostedGateway.createRefund).toHaveBeenNthCalledWith(
      2,
      request,
      first.externalStartedAt,
    );

    const expired = new Date('2020-01-01T00:00:00.000Z');
    await context.refundsRepository.update(refund.id, { externalStartedAt: expired });
    context.hostedGateway.createRefund.mockResolvedValueOnce({
      externalReference: refundReference,
      status: RefundStatus.Completed,
    });
    await restarted.reconcilePendingBatch();
    const recovered = await context.refundsRepository.findOneByOrFail({ id: refund.id });
    expect(recovered).toMatchObject({
      status: RefundStatus.Completed,
      externalReference: refundReference,
      completedAt: expect.any(Date),
    });
    expect(recovered.externalStartedAt!.getTime()).toBeGreaterThan(expired.getTime());
    expect(context.hostedGateway.createRefund).toHaveBeenNthCalledWith(
      3,
      request,
      recovered.externalStartedAt,
    );
    expect(context.hostedGateway.findRefund).toHaveBeenCalledTimes(2);
  });

  it.each(['reserva', 'evento'])(
    'registra estorno Stripe pendente no cancelamento de %s',
    async (target) => {
      const reservation = await context.createActiveReservation();
      const externalReference = `cs_test_${randomUUID()}`;
      const payment = await context.createPendingHostedPayment(reservation, externalReference);
      const externalPaymentReference = `pi_${randomUUID()}`;
      context.reportHostedPaymentAsPaid(payment.id, externalPaymentReference);
      await context.sendHostedNotification(payment.id, externalReference).expect(204);

      const isEventCancellation = target === 'evento';
      const cookie = await context.authenticate(
        isEventCancellation ? context.organizer : context.customer,
      );
      const path = isEventCancellation
        ? `/organizer/me/events/${reservation.eventId}/cancel`
        : `/reservations/${reservation.id}/cancel`;
      await request(context.app.getHttpServer())
        .post(path)
        .set('Cookie', cookie)
        .set('Origin', context.checkoutOrigin)
        .expect(200);

      await expect(context.refundsRepository.findBy({ paymentId: payment.id })).resolves.toEqual([
        expect.objectContaining({
          amountCents: payment.amountCents,
          status: RefundStatus.Pending,
          completedAt: null,
          failedAt: null,
        }),
      ]);
      await expect(
        context.paymentsRepository.findOneByOrFail({ id: payment.id }),
      ).resolves.toMatchObject({
        status: PaymentStatus.Approved,
        externalPaymentReference,
      });
      const item = await context.reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      await expect(
        context.ticketsRepository.findOneByOrFail({ reservationItemId: item.id }),
      ).resolves.toMatchObject({ cancelledAt: expect.any(Date) });
      await expect(
        context.eventSeatsRepository.findOneByOrFail({ id: item.eventSeatId! }),
      ).resolves.toMatchObject({ soldAt: null });
      const events = context.app.get(EventsService);
      await expect(
        events.findOrganizerEventById(context.organizer.id, reservation.eventId),
      ).resolves.toMatchObject({ revenueCents: payment.amountCents });
      context.hostedGateway.createRefund.mockImplementation(
        async ({ externalPaymentReference: charge }) => {
          if (charge !== externalPaymentReference) throw new HostedCheckoutUnavailableError();
          return { status: RefundStatus.Completed, externalReference: `re_${randomUUID()}` };
        },
      );
      const refundWorker = new HostedRefundReconciliationService(
        context.dataSource,
        context.hostedGateway,
      );
      await refundWorker.reconcilePendingBatch();
      await expect(
        events.findOrganizerEventById(context.organizer.id, reservation.eventId),
      ).resolves.toMatchObject({ revenueCents: 0 });
    },
  );
});
