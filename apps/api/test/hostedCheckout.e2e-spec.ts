import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { applicationConfig } from '../src/config/applicationConfig';
import { HostedCheckoutUnavailableError } from '../src/modules/payments/errors/hostedCheckoutUnavailable.error';
import { HostedPaymentReconciliationService } from '../src/modules/payments/hostedPaymentReconciliation.service';
import { PaymentCurrency } from '../src/modules/payments/paymentCurrency.enum';
import { PaymentMethod } from '../src/modules/payments/paymentMethod.enum';
import { PaymentCheckoutMode } from '../src/modules/payments/paymentCheckoutMode.enum';
import { PaymentProvider } from '../src/modules/payments/paymentProvider.enum';
import { hostedCheckoutMaxStoredAmountCents } from '../src/modules/payments/payments.constants';
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import { PaymentsTestContext } from './support/paymentsTestContext';

describe('Hosted checkout', () => {
  const context = new PaymentsTestContext();

  it('divulga o modo hospedado ao CUSTOMER sem expor credenciais ou configuração interna', async () => {
    const cookie = await context.authenticate();
    const result = await request(context.app.getHttpServer())
      .get('/payments/configuration')
      .set('Cookie', cookie)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(result.body).toEqual({
      mode: PaymentCheckoutMode.Hosted,
      methods: [PaymentMethod.Card, PaymentMethod.Pix],
    });
  });

  it('limita as três rotas hospedadas por CUSTOMER após autorizar e preserva o webhook', async () => {
    const cookie = await context.authenticate();
    const otherCookie = await context.authenticate(context.customerTwo);
    const reservation = await context.createActiveReservation();
    const endpoint = `/reservations/${reservation.id}/payments/hosted`;
    const externalReference = `cs_test_${randomUUID()}`;
    const redirect = { externalReference, checkoutUrl: 'https://checkout.stripe.com/test' };
    context.hostedGateway.createCheckout.mockResolvedValueOnce(redirect);
    context.hostedGateway.retrieveCheckout.mockResolvedValueOnce(redirect);
    const limited = await context.createPaymentsTestApplication(2);
    try {
      const server = limited.getHttpServer();
      await request(server).get(endpoint).set('Origin', context.checkoutOrigin).expect(401);
      await request(server).get(endpoint).set('Origin', context.checkoutOrigin).expect(401);
      // Uma origem rejeitada não pode consumir a quota da sessão autenticada.
      for (const method of ['get', 'post'] as const) {
        await request(server)
          [method](endpoint)
          .set('Cookie', cookie)
          .set('Origin', 'https://untrusted.example')
          .expect(403);
      }
      await request(server).get(endpoint).set('Cookie', cookie).expect(403);
      const creation = await context
        .startHostedRequest(reservation.id, cookie, randomUUID(), limited)
        .send({ method: PaymentMethod.Card })
        .expect(201);
      const paymentId = String(creation.body.id);
      await request(server)
        .get(endpoint)
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', cookie)
        .expect(200);
      const response = await request(server)
        .post(`${endpoint}/${paymentId}/resume`)
        .set('Cookie', cookie)
        .set('Origin', context.checkoutOrigin)
        .expect(429);
      expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers['retry-after-hostedcheckout']).toBeDefined();
      await request(server)
        .get(`/reservations/${randomUUID()}/payments/hosted`)
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', cookie)
        .expect(429);
      await request(server)
        .get(endpoint)
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', otherCookie)
        .expect(404);
      expect(context.hostedGateway.createCheckout).toHaveBeenCalledTimes(1);
      expect(context.hostedGateway.retrieveCheckout).toHaveBeenCalledTimes(1);

      context.reportHostedPaymentAsPaid(paymentId, `pi_${randomUUID()}`);
      await context.sendHostedNotification(paymentId, externalReference, {}, limited).expect(204);
      await expect(
        context.paymentsRepository.findOneByOrFail({ id: paymentId }),
      ).resolves.toMatchObject({
        status: PaymentStatus.Approved,
      });
    } finally {
      await limited.close();
    }
  });

  it('bloqueia os endpoints fake quando a API está em modo Stripe', async () => {
    const cookie = await context.authenticate();
    const reservation = await context.createActiveReservation();
    const root = `/reservations/${reservation.id}/payments`;
    const deployment = jest.replaceProperty(applicationConfig, 'payments', {
      provider: PaymentProvider.Stripe,
      cardPendingTimeoutSeconds: applicationConfig.payments.cardPendingTimeoutSeconds,
      secretKey: 'sk_test_guard_fixture',
      webhookSecret: context.webhookFixtureSecret,
    });
    try {
      const server = context.app.getHttpServer();
      const key = randomUUID();
      await request(server)
        .post(`${root}/card`)
        .set('Cookie', cookie)
        .set('Idempotency-Key', key)
        .expect(404);
      await request(server)
        .post(`${root}/pix`)
        .set('Cookie', cookie)
        .set('Idempotency-Key', key)
        .expect(404);
      await request(server).get(`${root}/pix`).set('Cookie', cookie).expect(404);
      await request(server)
        .post(`${root}/pix/${randomUUID()}/settle`)
        .set('Cookie', cookie)
        .set('Origin', context.checkoutOrigin)
        .expect(404);
      await expect(
        context.paymentsRepository.countBy({ reservationId: reservation.id }),
      ).resolves.toBe(0);
    } finally {
      deployment.restore();
    }
  });

  it.each([undefined, 'null', 'https://untrusted.example'])(
    'rejeita origem %s ao iniciar ou retomar o checkout',
    async (origin) => {
      const reservation = await context.createActiveReservation();
      const payment = await context.createPendingHostedPayment(reservation, null);
      const cookie = await context.authenticate();
      const route = `/reservations/${reservation.id}/payments/hosted`;
      const tests = [
        () =>
          request(context.app.getHttpServer())
            .post(route)
            .set('Idempotency-Key', randomUUID())
            .send({ method: PaymentMethod.Pix }),
        () => request(context.app.getHttpServer()).post(`${route}/${payment.id}/resume`),
      ];
      for (const makeTest of tests) {
        const test = makeTest().set('Cookie', cookie);
        if (origin) test.set('Origin', origin);
        const response = await test.expect(403);
        expect(response.body.code).toBe('PAYMENT_ORIGIN_NOT_ALLOWED');
      }
      expect(context.hostedGateway.createCheckout).not.toHaveBeenCalled();
      expect(context.hostedGateway.findCheckout).not.toHaveBeenCalled();
    },
  );

  it.each([
    [PaymentMethod.Card, [49], false],
    [PaymentMethod.Card, [50], true],
    [PaymentMethod.Pix, [49], false],
    [PaymentMethod.Pix, [99_999_999], true],
    [PaymentMethod.Pix, [100_000_000], false],
    [PaymentMethod.Card, [100_000_000], true],
    [PaymentMethod.Card, [hostedCheckoutMaxStoredAmountCents], true],
    [PaymentMethod.Card, [hostedCheckoutMaxStoredAmountCents, 1], false],
  ])('valida o total %s %j antes de criar a tentativa (%s)', async (method, prices, accepted) => {
    const reservation = await context.createActiveReservation(undefined, prices.length);
    const items = await context.reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });
    await Promise.all(
      items.map((item, index) =>
        context.reservationItemsRepository.update(item.id, { unitPriceCents: prices[index] }),
      ),
    );
    context.hostedGateway.createCheckout.mockResolvedValueOnce({
      externalReference: `cs_test_${randomUUID()}`,
      checkoutUrl: 'https://checkout.stripe.com/test',
    });
    const response = await context
      .startHostedRequest(reservation.id, await context.authenticate())
      .send({ method })
      .expect(accepted ? 201 : 422);
    await expect(
      context.paymentsRepository.countBy({ reservationId: reservation.id }),
    ).resolves.toBe(accepted ? 1 : 0);
    expect(context.hostedGateway.createCheckout).toHaveBeenCalledTimes(accepted ? 1 : 0);
    if (!accepted) expect(response.body.code).toBe('PAYMENT_AMOUNT_UNSUPPORTED');
  });

  it('retoma o mesmo checkout após timeout, por consulta e retry sem a chave do cliente', async () => {
    const reservation = await context.createActiveReservation(undefined, 2);
    const cookie = await context.authenticate();
    const otherCookie = await context.authenticate(context.customerTwo);
    const key = randomUUID();
    const endpoint = `/reservations/${reservation.id}/payments/hosted`;
    const redirect = {
      externalReference: 'cs_test_recovered',
      checkoutUrl: 'https://checkout.stripe.com/test',
    };
    context.hostedGateway.createCheckout.mockImplementationOnce(async (payment) => {
      await expect(
        context.paymentsRepository.findOneByOrFail({ id: payment.paymentId }),
      ).resolves.toMatchObject({
        status: PaymentStatus.Pending,
        provider: PaymentProvider.Stripe,
        amountCents: 5180,
        externalReference: null,
      });
      throw new HostedCheckoutUnavailableError();
    });

    await context
      .startHostedRequest(reservation.id, cookie, key)
      .send({ method: PaymentMethod.Pix, amountCents: 1 })
      .expect(400);
    await context
      .startHostedRequest(reservation.id, cookie, key)
      .send({ method: PaymentMethod.Pix })
      .expect(503);
    const persisted = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    await request(context.app.getHttpServer())
      .get(endpoint)
      .set('Origin', context.checkoutOrigin)
      .set('Cookie', otherCookie)
      .expect(404);
    const pending = await request(context.app.getHttpServer())
      .get(endpoint)
      .set('Origin', context.checkoutOrigin)
      .set('Cookie', cookie)
      .expect(200);
    expect(pending.body).toMatchObject({
      id: persisted.id,
      status: PaymentStatus.Pending,
      checkoutUrl: null,
      canResume: true,
    });
    expect(context.hostedGateway.createCheckout).toHaveBeenCalledTimes(1);
    await context
      .startHostedRequest(reservation.id, cookie)
      .send({ method: PaymentMethod.Card })
      .expect(409);

    context.hostedGateway.createCheckout.mockResolvedValueOnce(redirect);
    const resumed = await request(context.app.getHttpServer())
      .post(`${endpoint}/${persisted.id}/resume`)
      .set('Cookie', cookie)
      .set('Origin', context.checkoutOrigin)
      .expect(200);
    expect(resumed.body).toMatchObject({
      id: persisted.id,
      method: PaymentMethod.Pix,
      currency: PaymentCurrency.Brl,
      checkoutUrl: redirect.checkoutUrl,
      canResume: false,
    });
    expect(resumed.body).not.toHaveProperty('externalReference');
    expect(context.hostedGateway.createCheckout.mock.calls[1]).toEqual(
      context.hostedGateway.createCheckout.mock.calls[0],
    );

    context.hostedGateway.retrieveCheckout.mockResolvedValue(redirect);
    await context
      .startHostedRequest(reservation.id, cookie, key)
      .send({ method: PaymentMethod.Card })
      .expect(201);
    await request(context.app.getHttpServer())
      .get(endpoint)
      .set('Origin', context.checkoutOrigin)
      .set('Cookie', cookie)
      .expect(200);
    expect(context.hostedGateway.retrieveCheckout).toHaveBeenCalledTimes(2);
    expect(context.hostedGateway.createCheckout).toHaveBeenCalledTimes(2);
    await expect(
      context.paymentsRepository.countBy({ reservationId: reservation.id }),
    ).resolves.toBe(1);
  });

  it('redescobre sessão após 500 persistente e reinício da aplicação sem webhook', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const key = randomUUID();
    const externalReference = `cs_test_${randomUUID()}`;
    const externalPaymentReference = `pi_${randomUUID()}`;
    const originalReturnUrl = new URL(
      `/customer/reservations/${reservation.id}`,
      context.checkoutOrigin,
    ).href;
    context.hostedGateway.createCheckout.mockRejectedValue(new HostedCheckoutUnavailableError());

    const creator = await context.createPaymentsTestApplication();
    try {
      await context
        .startHostedRequest(reservation.id, cookie, key, creator)
        .send({ method: PaymentMethod.Card })
        .expect(503);
      const changed = jest.replaceProperty(applicationConfig, 'corsOrigins', [
        'https://new-web.example',
        context.checkoutOrigin,
      ]);
      try {
        await context
          .startHostedRequest(reservation.id, cookie, key, creator)
          .send({ method: PaymentMethod.Card })
          .expect(503);
      } finally {
        changed.restore();
      }
    } finally {
      await creator.close();
    }

    const payment = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    expect(payment).toMatchObject({
      status: PaymentStatus.Pending,
      externalReference: null,
      checkoutReturnUrl: originalReturnUrl,
    });
    expect(context.hostedGateway.createCheckout.mock.calls).toEqual([
      [expect.objectContaining({ paymentId: payment.id }), originalReturnUrl],
      [expect.objectContaining({ paymentId: payment.id }), originalReturnUrl],
    ]);

    context.hostedGateway.findCheckout.mockImplementation(async ({ paymentId }) =>
      paymentId === payment.id ? { externalReference, checkoutUrl: null } : null,
    );
    context.reportHostedPaymentAsPaid(payment.id, externalPaymentReference);
    const restarted = await context.createPaymentsTestApplication();
    try {
      // Dispara o mesmo ciclo do worker sem aguardar o intervalo de produção.
      await restarted.get(HostedPaymentReconciliationService).reconcilePendingBatch();
    } finally {
      await restarted.close();
    }

    await expect(
      context.paymentsRepository.findBy({ reservationId: reservation.id }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: payment.id,
        status: PaymentStatus.Approved,
        externalReference,
        externalPaymentReference,
      }),
    ]);
    const item = await context.reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    await expect(context.ticketsRepository.countBy({ reservationItemId: item.id })).resolves.toBe(
      1,
    );
    expect(context.hostedGateway.createCheckout).toHaveBeenCalledTimes(2);
  });

  it('só busca a sessão de uma tentativa legada sem a URL original', async () => {
    const reservation = await context.createActiveReservation();
    const payment = await context.createPendingHostedPayment(reservation, null);
    const cookie = await context.authenticate();
    const endpoint = `/reservations/${reservation.id}/payments/hosted/${payment.id}/resume`;

    await request(context.app.getHttpServer())
      .post(endpoint)
      .set('Cookie', cookie)
      .set('Origin', context.checkoutOrigin)
      .expect(503);
    expect(context.hostedGateway.createCheckout).not.toHaveBeenCalled();

    const externalReference = `cs_test_${randomUUID()}`;
    const checkoutUrl = 'https://checkout.stripe.com/test';
    context.hostedGateway.findCheckout.mockResolvedValueOnce({ externalReference, checkoutUrl });
    const response = await request(context.app.getHttpServer())
      .post(endpoint)
      .set('Cookie', cookie)
      .set('Origin', context.checkoutOrigin)
      .expect(200);
    expect(response.body).toMatchObject({ id: payment.id, checkoutUrl });
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: payment.id }),
    ).resolves.toMatchObject({
      externalReference,
    });
    expect(context.hostedGateway.createCheckout).not.toHaveBeenCalled();
  });

  it('não repete o POST se o hold vencer enquanto procura a sessão sem vínculo', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    context.hostedGateway.createCheckout.mockRejectedValueOnce(
      new HostedCheckoutUnavailableError(),
    );
    await context
      .startHostedRequest(reservation.id, cookie)
      .send({ method: PaymentMethod.Card })
      .expect(503);
    const payment = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    context.hostedGateway.findCheckout.mockImplementationOnce(async () => {
      await context.reservationsRepository.update(reservation.id, {
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        expiresAt: new Date('2020-01-01T00:10:00.000Z'),
      });
      return null;
    });

    const response = await request(context.app.getHttpServer())
      .post(`/reservations/${reservation.id}/payments/hosted/${payment.id}/resume`)
      .set('Cookie', cookie)
      .set('Origin', context.checkoutOrigin)
      .expect(200);
    expect(response.body).toMatchObject({ id: payment.id, checkoutUrl: null, canResume: false });
    expect(context.hostedGateway.createCheckout).toHaveBeenCalledTimes(1);
  });

  it.each([PaymentMethod.Card, PaymentMethod.Pix])(
    'confirma reserva gratuita localmente com %s',
    async (method) => {
      const reservation = await context.createActiveReservation();
      const cookie = await context.authenticate();
      await context.reservationItemsRepository.update(
        { reservationId: reservation.id },
        { unitPriceCents: 0 },
      );

      const response = await context
        .startHostedRequest(reservation.id, cookie)
        .send({ method })
        .expect(201);

      expect(response.body).toMatchObject({
        amountCents: 0,
        status: PaymentStatus.Approved,
        checkoutUrl: null,
        canResume: false,
      });
      await expect(
        context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({ confirmedAt: expect.any(Date) });
      expect(context.hostedGateway.createCheckout).not.toHaveBeenCalled();
      expect(context.hostedGateway.assertCheckoutAmount).not.toHaveBeenCalled();
      expect(context.paymentGateway.processCard).not.toHaveBeenCalled();
    },
  );

  it('salva a referência sem devolver o link se a reserva expirar durante a criação', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    context.hostedGateway.createCheckout.mockImplementationOnce(async () => {
      await context.reservationsRepository.update(reservation.id, {
        createdAt: new Date('2000-01-01T00:00:00Z'),
        expiresAt: new Date('2000-01-01T00:10:00Z'),
      });
      return {
        externalReference: 'cs_test_after_hold',
        checkoutUrl: 'https://checkout.stripe.com/test',
      };
    });

    const response = await context
      .startHostedRequest(reservation.id, cookie)
      .send({ method: PaymentMethod.Card })
      .expect(201);

    expect(response.body).toMatchObject({
      status: PaymentStatus.Pending,
      checkoutUrl: null,
      canResume: false,
    });
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: response.body.id }),
    ).resolves.toMatchObject({
      provider: PaymentProvider.Stripe,
      externalReference: 'cs_test_after_hold',
    });
  });

  it('mantém o cartão Stripe pendente após a janela técnica do cartão fake', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const payment = await context.paymentsRepository.save({
      reservationId: reservation.id,
      method: PaymentMethod.Card,
      provider: PaymentProvider.Stripe,
      status: PaymentStatus.Pending,
      idempotencyKey: randomUUID(),
      amountCents: 2590,
      currency: PaymentCurrency.Brl,
      createdAt: new Date('2000-01-01T00:00:00Z'),
    });

    const response = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(409);

    expect(response.body.code).toBe('PAYMENT_IN_PROGRESS');
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: payment.id }),
    ).resolves.toMatchObject({
      status: PaymentStatus.Pending,
      failedAt: null,
      externalReference: null,
    });
    expect(context.paymentGateway.processCard).not.toHaveBeenCalled();
  });

  it('persiste PIX Stripe sem simulação e vincula cada referência externa a uma única tentativa', async () => {
    const firstReservation = await context.createActiveReservation();
    const secondReservation = await context.createActiveReservation();
    const pendingStripePix = {
      method: PaymentMethod.Pix,
      provider: PaymentProvider.Stripe,
      status: PaymentStatus.Pending,
      amountCents: 2590,
      currency: PaymentCurrency.Brl,
    };
    const first = await context.paymentsRepository.save({
      ...pendingStripePix,
      reservationId: firstReservation.id,
      idempotencyKey: randomUUID(),
    });
    const second = await context.paymentsRepository.save({
      ...pendingStripePix,
      reservationId: secondReservation.id,
      idempotencyKey: randomUUID(),
    });

    const externalReference = `session-${randomUUID()}`;
    await context.paymentsRepository.update(first.id, { externalReference });
    await expect(
      context.paymentsRepository.update(second.id, { externalReference }),
    ).rejects.toMatchObject({
      driverError: { constraint: 'paymentsProviderExternalReferenceUnique' },
    });
    await expect(
      context.paymentsRepository.update(first.id, { simulationCompletionAt: new Date() }),
    ).rejects.toMatchObject({
      driverError: { constraint: 'paymentsSimulationCompletionMatchesProviderAndMethod' },
    });

    const cookie = await context.authenticate();
    await request(context.app.getHttpServer())
      .get(`/reservations/${firstReservation.id}/payments/pix`)
      .set('Cookie', cookie)
      .expect(404);
    await context
      .settlePixRequest(firstReservation.id, first.id, cookie)
      .set('Origin', context.checkoutOrigin)
      .expect(404);
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: first.id }),
    ).resolves.toMatchObject({
      externalReference,
      simulationCompletionAt: null,
      status: PaymentStatus.Pending,
    });
  });
});
