import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { type Response as HttpResponse, type Test as HttpRequest } from 'supertest';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { applicationConfig } from '../src/config/applicationConfig';
import { Application } from '../src/application';
import { CatalogSource } from '../src/modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../src/modules/events/admissionMode.enum';
import { Event } from '../src/modules/events/event.entity';
import { EventCategory } from '../src/modules/events/eventCategory.enum';
import { EventSeat } from '../src/modules/events/eventSeat.entity';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { EventsService } from '../src/modules/events/events.service';
import { HostedCheckoutUnavailableError } from '../src/modules/payments/errors/hostedCheckoutUnavailable.error';
import { PaymentInProgressError } from '../src/modules/payments/errors/paymentInProgress.error';
import { ReservationAlreadyPaidError } from '../src/modules/payments/errors/reservationAlreadyPaid.error';
import { HostedPaymentGateway } from '../src/modules/payments/hostedPaymentGateway.interfaces';
import { HostedPaymentOutcomeStatus } from '../src/modules/payments/hostedPaymentOutcomeStatus.enum';
import { HostedPaymentReconciliationService } from '../src/modules/payments/hostedPaymentReconciliation.service';
import { Payment } from '../src/modules/payments/payment.entity';
import { PaymentCurrency } from '../src/modules/payments/paymentCurrency.enum';
import { PaymentMethod } from '../src/modules/payments/paymentMethod.enum';
import { PaymentCheckoutMode } from '../src/modules/payments/paymentCheckoutMode.enum';
import { PaymentProvider } from '../src/modules/payments/paymentProvider.enum';
import {
  hostedCheckoutMaxStoredAmountCents,
  hostedPaymentGatewayToken,
  paymentGatewayToken,
  stripeCheckoutWebhookToken,
} from '../src/modules/payments/payments.constants';
import { PaymentsService } from '../src/modules/payments/payments.service';
import {
  CardPaymentGatewayRequest,
  CardPaymentGatewayResult,
  CardPaymentGatewayStatus,
  PaymentGateway,
} from '../src/modules/payments/paymentGateway.interfaces';
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import {
  StripeCheckoutEventType,
  StripeCheckoutObject,
} from '../src/modules/payments/stripe/stripeCheckout.enums';
import { StripeCheckoutWebhook } from '../src/modules/payments/stripe/stripeCheckoutWebhook';
import { StripeHostedPaymentGateway } from '../src/modules/payments/stripe/stripeHostedPaymentGateway';
import { SeatRealtimeGateway } from '../src/modules/realtime/seatRealtime.gateway';
import { HostedRefundReconciliationService } from '../src/modules/refunds/hostedRefundReconciliation.service';
import { Refund } from '../src/modules/refunds/refund.entity';
import { RefundStatus } from '../src/modules/refunds/refundStatus.enum';
import { ReservationItem } from '../src/modules/reservations/reservationItem.entity';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { Ticket } from '../src/modules/tickets/ticket.entity';
import { TicketCredentialService } from '../src/modules/tickets/ticketCredential.service';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';
import { VenueSeat } from '../src/modules/venues/venueSeat.entity';

class ControlledPaymentGateway implements PaymentGateway {
  public processCard = jest.fn(
    async (request: CardPaymentGatewayRequest): Promise<CardPaymentGatewayResult> => {
      void request;
      return { status: CardPaymentGatewayStatus.Approved };
    },
  );
}

describe('Payments', () => {
  const checkoutOrigin = applicationConfig.corsOrigins[0];
  const sevenDaysInMilliseconds = 7 * 24 * 60 * 60 * 1000;
  const lockPollAttempts = 100;
  const lockPollIntervalMilliseconds = 20;
  const deadlineAfterLockObservedMilliseconds = 50;
  const deadlineBeforeRequestMilliseconds = 2_000;
  const webhookFixtureSecret = 'whsec_payment_test_fixture';
  const webhookEndpoint = '/payments/webhooks/stripe';
  let app: INestApplication;
  let dataSource: DataSource;
  let eventsRepository: Repository<Event>;
  let eventSeatsRepository: Repository<EventSeat>;
  let paymentsRepository: Repository<Payment>;
  let reservationItemsRepository: Repository<ReservationItem>;
  let reservationsRepository: Repository<Reservation>;
  let refundsRepository: Repository<Refund>;
  let ticketsRepository: Repository<Ticket>;
  let ticketCredentialService: TicketCredentialService;
  let venueSeatsRepository: Repository<VenueSeat>;
  let customer: User;
  let customerTwo: User;
  let organizer: User;
  let venue: Venue;
  let paymentGateway: ControlledPaymentGateway;
  const stripeAmountPolicy = new StripeHostedPaymentGateway('sk_test_amount_policy_fixture');
  const hostedGateway: jest.Mocked<HostedPaymentGateway> = {
    provider: PaymentProvider.Stripe,
    creationRetryWindowMs: 82_800_000,
    refundIdempotencyRetentionMs: 86_400_000,
    assertCheckoutAmount: jest.fn(),
    createCheckout: jest.fn(),
    findCheckout: jest.fn(),
    retrieveCheckout: jest.fn(),
    retrievePaymentOutcome: jest.fn(),
    expireCheckout: jest.fn(),
    createRefund: jest.fn(),
    findRefund: jest.fn(),
    retrieveRefund: jest.fn(),
  };
  let paymentsService: PaymentsService;
  let reconciliation: HostedPaymentReconciliationService;
  let refundReconciliation: HostedRefundReconciliationService;
  let seatRealtimeGateway: SeatRealtimeGateway;
  const createdEventIds: string[] = [];

  async function createPaymentsTestApplication(): Promise<INestApplication> {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(paymentGatewayToken)
      .useValue(paymentGateway)
      .overrideProvider(hostedPaymentGatewayToken)
      .useValue(hostedGateway)
      .overrideProvider(stripeCheckoutWebhookToken)
      .useValue(new StripeCheckoutWebhook(webhookFixtureSecret))
      .compile();

    const testApp = testingModule.createNestApplication({ rawBody: true });
    new Application().configure(testApp);
    await testApp.init();
    return testApp;
  }

  beforeAll(async () => {
    paymentGateway = new ControlledPaymentGateway();
    app = await createPaymentsTestApplication();

    dataSource = app.get(DataSource);
    paymentsService = app.get(PaymentsService);
    reconciliation = app.get(HostedPaymentReconciliationService);
    refundReconciliation = app.get(HostedRefundReconciliationService);
    eventsRepository = dataSource.getRepository(Event);
    eventSeatsRepository = dataSource.getRepository(EventSeat);
    paymentsRepository = dataSource.getRepository(Payment);
    reservationItemsRepository = dataSource.getRepository(ReservationItem);
    reservationsRepository = dataSource.getRepository(Reservation);
    refundsRepository = dataSource.getRepository(Refund);
    ticketsRepository = dataSource.getRepository(Ticket);
    ticketCredentialService = app.get(TicketCredentialService);
    seatRealtimeGateway = app.get(SeatRealtimeGateway);
    jest.spyOn(seatRealtimeGateway, 'emitSold').mockImplementation();
    jest.spyOn(seatRealtimeGateway, 'emitReleased').mockImplementation();
    venueSeatsRepository = dataSource.getRepository(VenueSeat);
    customer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.one.demo@ntq.local' });
    customerTwo = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.two.demo@ntq.local' });
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    venue = await dataSource
      .getRepository(Venue)
      .findOneByOrFail({ name: 'Cine Imperial · Sala A' });
  });

  beforeEach(() => {
    paymentGateway.processCard.mockReset();
    paymentGateway.processCard.mockResolvedValue({ status: CardPaymentGatewayStatus.Approved });
    hostedGateway.createCheckout.mockReset();
    hostedGateway.assertCheckoutAmount.mockReset();
    hostedGateway.assertCheckoutAmount.mockImplementation(
      stripeAmountPolicy.assertCheckoutAmount.bind(stripeAmountPolicy),
    );
    hostedGateway.findCheckout.mockReset().mockResolvedValue(null);
    hostedGateway.retrieveCheckout.mockReset();
    hostedGateway.retrievePaymentOutcome.mockReset();
    hostedGateway.expireCheckout.mockReset();
    hostedGateway.createRefund.mockReset();
    hostedGateway.findRefund.mockReset();
    hostedGateway.retrieveRefund.mockReset();
    jest.mocked(seatRealtimeGateway.emitSold).mockClear();
    jest.mocked(seatRealtimeGateway.emitReleased).mockClear();
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      const reservations = await reservationsRepository.find({
        select: { id: true },
        where: { eventId: In(createdEventIds) },
      });
      const reservationIds = reservations.map(({ id }) => id);

      if (reservationIds.length > 0) {
        const items = await reservationItemsRepository.find({
          select: { id: true },
          where: { reservationId: In(reservationIds) },
        });
        const itemIds = items.map(({ id }) => id);

        if (itemIds.length > 0) {
          await ticketsRepository.delete({ reservationItemId: In(itemIds) });
        }
        const payments = await paymentsRepository.find({
          select: { id: true },
          where: { reservationId: In(reservationIds) },
        });
        const paymentIds = payments.map(({ id }) => id);
        if (paymentIds.length > 0) {
          await refundsRepository.delete({ paymentId: In(paymentIds) });
        }
        await paymentsRepository.delete({ reservationId: In(reservationIds) });
        await reservationItemsRepository.delete({ reservationId: In(reservationIds) });
      }
      await eventSeatsRepository.delete({ eventId: In(createdEventIds) });
      await reservationsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    await app.close();
  });

  async function authenticate(user: User = customer): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email: user.email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  async function createActiveReservation(
    expiresAt = new Date('2099-09-01T23:30:00.000Z'),
    itemCount = 1,
    parameters: { event?: Event; customer?: User; seatOffset?: number } = {},
  ): Promise<Reservation> {
    const event =
      parameters.event ??
      (await eventsRepository.save({
        organizerId: organizer.id,
        venueId: venue.id,
        title: 'Pagamento idempotente',
        description: null,
        imageUrl: null,
        genres: ['Drama'],
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Published,
        startsAt: new Date('2099-10-01T23:30:00.000Z'),
        priceCents: 2590,
        capacity: null,
        catalogSource: CatalogSource.Tmdb,
        externalId: randomUUID(),
      }));
    if (!parameters.event) {
      createdEventIds.push(event.id);
    }
    const venueSeats = await venueSeatsRepository.find({
      where: { venueId: venue.id },
      order: { row: 'ASC', number: 'ASC' },
      skip: parameters.seatOffset ?? 0,
      take: itemCount,
    });

    if (venueSeats.length !== itemCount) {
      throw new Error('Venue de demonstração não possui assentos suficientes para o teste');
    }

    const reservation =
      expiresAt.getTime() > Date.now()
        ? await reservationsRepository.save({
            customerId: parameters.customer?.id ?? customer.id,
            eventId: event.id,
            expiresAt,
            confirmedAt: null,
            cancelledAt: null,
          })
        : await createExpiredReservation(
            parameters.customer?.id ?? customer.id,
            event.id,
            expiresAt,
          );
    const eventSeats = await eventSeatsRepository.save(
      venueSeats.map((venueSeat) =>
        eventSeatsRepository.create({
          eventId: event.id,
          venueSeatId: venueSeat.id,
          holdReservationId: reservation.id,
          holdExpiresAt: expiresAt,
          soldAt: null,
        }),
      ),
    );
    await reservationItemsRepository.save(
      eventSeats.map((eventSeat) =>
        reservationItemsRepository.create({
          reservationId: reservation.id,
          eventSeatId: eventSeat.id,
          unitPriceCents: 2590,
        }),
      ),
    );

    return reservation;
  }

  async function createExpiredReservation(
    customerId: string,
    eventId: string,
    expiresAt: Date,
  ): Promise<Reservation> {
    const createdAt = new Date(expiresAt.getTime() - 60 * 1000);
    const rows = (await dataSource.query(
      `
        INSERT INTO "reservations" (
          "customerId", "eventId", "createdAt", "updatedAt", "expiresAt", "confirmedAt", "cancelledAt"
        ) VALUES ($1, $2, $3, $3, $4, NULL, NULL)
        RETURNING "id"
      `,
      [customerId, eventId, createdAt, expiresAt],
    )) as Array<{ id: string }>;

    return reservationsRepository.findOneByOrFail({ id: rows[0].id });
  }

  function createPaymentRequest(reservationId: string, idempotencyKey: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/reservations/${reservationId}/payments/card`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        cardNumber: '4242 4242 4242 4242',
        cardholderName: 'Ana Beatriz Souza',
        expiry: '08/29',
        cvv: '123',
      });
  }

  function createPixRequest(
    reservationId: string,
    cookie: string,
    idempotencyKey: string = randomUUID(),
    application = app,
  ) {
    return request(application.getHttpServer())
      .post(`/reservations/${reservationId}/payments/pix`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey);
  }

  function settlePixRequest(reservationId: string, paymentId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/reservations/${reservationId}/payments/pix/${paymentId}/settle`)
      .set('Cookie', cookie);
  }

  function startHostedRequest(
    reservationId: string,
    cookie: string,
    idempotencyKey = randomUUID(),
    instance = app,
  ) {
    return request(instance.getHttpServer())
      .post(`/reservations/${reservationId}/payments/hosted`)
      .set('Cookie', cookie)
      .set('Origin', checkoutOrigin)
      .set('Idempotency-Key', idempotencyKey);
  }

  it('divulga o modo hospedado ao CUSTOMER sem expor credenciais ou configuração interna', async () => {
    const cookie = await authenticate();
    const result = await request(app.getHttpServer())
      .get('/payments/configuration')
      .set('Cookie', cookie)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(result.body).toEqual({
      mode: PaymentCheckoutMode.Hosted,
      methods: [PaymentMethod.Card, PaymentMethod.Pix],
    });
  });

  it('bloqueia os endpoints fake quando a API está em modo Stripe', async () => {
    const cookie = await authenticate();
    const reservation = await createActiveReservation();
    const root = `/reservations/${reservation.id}/payments`;
    const deployment = jest.replaceProperty(applicationConfig, 'payments', {
      provider: PaymentProvider.Stripe,
      cardPendingTimeoutSeconds: applicationConfig.payments.cardPendingTimeoutSeconds,
      secretKey: 'sk_test_guard_fixture',
      webhookSecret: webhookFixtureSecret,
    });
    try {
      const server = app.getHttpServer();
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
        .set('Origin', checkoutOrigin)
        .expect(404);
      await expect(paymentsRepository.countBy({ reservationId: reservation.id })).resolves.toBe(0);
    } finally {
      deployment.restore();
    }
  });

  it.each([undefined, 'null', 'https://untrusted.example'])(
    'rejeita origem %s ao iniciar ou retomar o checkout',
    async (origin) => {
      const reservation = await createActiveReservation();
      const payment = await createPendingHostedPayment(reservation, null);
      const cookie = await authenticate();
      const route = `/reservations/${reservation.id}/payments/hosted`;
      const tests = [
        () =>
          request(app.getHttpServer())
            .post(route)
            .set('Idempotency-Key', randomUUID())
            .send({ method: PaymentMethod.Pix }),
        () => request(app.getHttpServer()).post(`${route}/${payment.id}/resume`),
      ];
      for (const makeTest of tests) {
        const test = makeTest().set('Cookie', cookie);
        if (origin) test.set('Origin', origin);
        const response = await test.expect(403);
        expect(response.body.code).toBe('PAYMENT_ORIGIN_NOT_ALLOWED');
      }
      expect(hostedGateway.createCheckout).not.toHaveBeenCalled();
      expect(hostedGateway.findCheckout).not.toHaveBeenCalled();
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
    const reservation = await createActiveReservation(undefined, prices.length);
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
    await Promise.all(
      items.map((item, index) =>
        reservationItemsRepository.update(item.id, { unitPriceCents: prices[index] }),
      ),
    );
    hostedGateway.createCheckout.mockResolvedValueOnce({
      externalReference: `cs_test_${randomUUID()}`,
      checkoutUrl: 'https://checkout.stripe.com/test',
    });
    const response = await startHostedRequest(reservation.id, await authenticate())
      .send({ method })
      .expect(accepted ? 201 : 422);
    await expect(paymentsRepository.countBy({ reservationId: reservation.id })).resolves.toBe(
      accepted ? 1 : 0,
    );
    expect(hostedGateway.createCheckout).toHaveBeenCalledTimes(accepted ? 1 : 0);
    if (!accepted) expect(response.body.code).toBe('PAYMENT_AMOUNT_UNSUPPORTED');
  });

  it('retoma o mesmo checkout após timeout, por consulta e retry sem a chave do cliente', async () => {
    const reservation = await createActiveReservation(undefined, 2);
    const cookie = await authenticate();
    const otherCookie = await authenticate(customerTwo);
    const key = randomUUID();
    const endpoint = `/reservations/${reservation.id}/payments/hosted`;
    const redirect = {
      externalReference: 'cs_test_recovered',
      checkoutUrl: 'https://checkout.stripe.com/test',
    };
    hostedGateway.createCheckout.mockImplementationOnce(async (payment) => {
      await expect(
        paymentsRepository.findOneByOrFail({ id: payment.paymentId }),
      ).resolves.toMatchObject({
        status: PaymentStatus.Pending,
        provider: PaymentProvider.Stripe,
        amountCents: 5180,
        externalReference: null,
      });
      throw new HostedCheckoutUnavailableError();
    });

    await startHostedRequest(reservation.id, cookie, key)
      .send({ method: PaymentMethod.Pix, amountCents: 1 })
      .expect(400);
    await startHostedRequest(reservation.id, cookie, key)
      .send({ method: PaymentMethod.Pix })
      .expect(503);
    const persisted = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
    await request(app.getHttpServer()).get(endpoint).set('Cookie', otherCookie).expect(404);
    const pending = await request(app.getHttpServer())
      .get(endpoint)
      .set('Cookie', cookie)
      .expect(200);
    expect(pending.body).toMatchObject({
      id: persisted.id,
      status: PaymentStatus.Pending,
      checkoutUrl: null,
      canResume: true,
    });
    expect(hostedGateway.createCheckout).toHaveBeenCalledTimes(1);
    await startHostedRequest(reservation.id, cookie)
      .send({ method: PaymentMethod.Card })
      .expect(409);

    hostedGateway.createCheckout.mockResolvedValueOnce(redirect);
    const resumed = await request(app.getHttpServer())
      .post(`${endpoint}/${persisted.id}/resume`)
      .set('Cookie', cookie)
      .set('Origin', checkoutOrigin)
      .expect(200);
    expect(resumed.body).toMatchObject({
      id: persisted.id,
      method: PaymentMethod.Pix,
      currency: PaymentCurrency.Brl,
      checkoutUrl: redirect.checkoutUrl,
      canResume: false,
    });
    expect(resumed.body).not.toHaveProperty('externalReference');
    expect(hostedGateway.createCheckout.mock.calls[1]).toEqual(
      hostedGateway.createCheckout.mock.calls[0],
    );

    hostedGateway.retrieveCheckout.mockResolvedValue(redirect);
    await startHostedRequest(reservation.id, cookie, key)
      .send({ method: PaymentMethod.Card })
      .expect(201);
    await request(app.getHttpServer()).get(endpoint).set('Cookie', cookie).expect(200);
    expect(hostedGateway.retrieveCheckout).toHaveBeenCalledTimes(2);
    expect(hostedGateway.createCheckout).toHaveBeenCalledTimes(2);
    await expect(paymentsRepository.countBy({ reservationId: reservation.id })).resolves.toBe(1);
  });

  it('redescobre sessão após 500 persistente e reinício da aplicação sem webhook', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const key = randomUUID();
    const externalReference = `cs_test_${randomUUID()}`;
    const externalPaymentReference = `pi_${randomUUID()}`;
    const originalReturnUrl = new URL(`/customer/reservations/${reservation.id}`, checkoutOrigin)
      .href;
    hostedGateway.createCheckout.mockRejectedValue(new HostedCheckoutUnavailableError());

    const creator = await createPaymentsTestApplication();
    try {
      await startHostedRequest(reservation.id, cookie, key, creator)
        .send({ method: PaymentMethod.Card })
        .expect(503);
      const changed = jest.replaceProperty(applicationConfig, 'corsOrigins', [
        'https://new-web.example',
        checkoutOrigin,
      ]);
      try {
        await startHostedRequest(reservation.id, cookie, key, creator)
          .send({ method: PaymentMethod.Card })
          .expect(503);
      } finally {
        changed.restore();
      }
    } finally {
      await creator.close();
    }

    const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
    expect(payment).toMatchObject({
      status: PaymentStatus.Pending,
      externalReference: null,
      checkoutReturnUrl: originalReturnUrl,
    });
    expect(hostedGateway.createCheckout.mock.calls).toEqual([
      [expect.objectContaining({ paymentId: payment.id }), originalReturnUrl],
      [expect.objectContaining({ paymentId: payment.id }), originalReturnUrl],
    ]);

    hostedGateway.findCheckout.mockImplementation(async ({ paymentId }) =>
      paymentId === payment.id ? { externalReference, checkoutUrl: null } : null,
    );
    reportHostedPaymentAsPaid(payment.id, externalPaymentReference);
    const restarted = await createPaymentsTestApplication();
    try {
      // Dispara o mesmo ciclo do worker sem aguardar o intervalo de produção.
      await restarted.get(HostedPaymentReconciliationService).reconcilePendingBatch();
    } finally {
      await restarted.close();
    }

    await expect(paymentsRepository.findBy({ reservationId: reservation.id })).resolves.toEqual([
      expect.objectContaining({
        id: payment.id,
        status: PaymentStatus.Approved,
        externalReference,
        externalPaymentReference,
      }),
    ]);
    const item = await reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    await expect(ticketsRepository.countBy({ reservationItemId: item.id })).resolves.toBe(1);
    expect(hostedGateway.createCheckout).toHaveBeenCalledTimes(2);
  });

  it('só busca a sessão de uma tentativa legada sem a URL original', async () => {
    const reservation = await createActiveReservation();
    const payment = await createPendingHostedPayment(reservation, null);
    const cookie = await authenticate();
    const endpoint = `/reservations/${reservation.id}/payments/hosted/${payment.id}/resume`;

    await request(app.getHttpServer())
      .post(endpoint)
      .set('Cookie', cookie)
      .set('Origin', checkoutOrigin)
      .expect(503);
    expect(hostedGateway.createCheckout).not.toHaveBeenCalled();

    const externalReference = `cs_test_${randomUUID()}`;
    const checkoutUrl = 'https://checkout.stripe.com/test';
    hostedGateway.findCheckout.mockResolvedValueOnce({ externalReference, checkoutUrl });
    const response = await request(app.getHttpServer())
      .post(endpoint)
      .set('Cookie', cookie)
      .set('Origin', checkoutOrigin)
      .expect(200);
    expect(response.body).toMatchObject({ id: payment.id, checkoutUrl });
    await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
      externalReference,
    });
    expect(hostedGateway.createCheckout).not.toHaveBeenCalled();
  });

  it('não repete o POST se o hold vencer enquanto procura a sessão sem vínculo', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    hostedGateway.createCheckout.mockRejectedValueOnce(new HostedCheckoutUnavailableError());
    await startHostedRequest(reservation.id, cookie)
      .send({ method: PaymentMethod.Card })
      .expect(503);
    const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
    hostedGateway.findCheckout.mockImplementationOnce(async () => {
      await reservationsRepository.update(reservation.id, {
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        expiresAt: new Date('2020-01-01T00:10:00.000Z'),
      });
      return null;
    });

    const response = await request(app.getHttpServer())
      .post(`/reservations/${reservation.id}/payments/hosted/${payment.id}/resume`)
      .set('Cookie', cookie)
      .set('Origin', checkoutOrigin)
      .expect(200);
    expect(response.body).toMatchObject({ id: payment.id, checkoutUrl: null, canResume: false });
    expect(hostedGateway.createCheckout).toHaveBeenCalledTimes(1);
  });

  it.each([PaymentMethod.Card, PaymentMethod.Pix])(
    'confirma reserva gratuita localmente com %s',
    async (method) => {
      const reservation = await createActiveReservation();
      const cookie = await authenticate();
      await reservationItemsRepository.update(
        { reservationId: reservation.id },
        { unitPriceCents: 0 },
      );

      const response = await startHostedRequest(reservation.id, cookie)
        .send({ method })
        .expect(201);

      expect(response.body).toMatchObject({
        amountCents: 0,
        status: PaymentStatus.Approved,
        checkoutUrl: null,
        canResume: false,
      });
      await expect(
        reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({ confirmedAt: expect.any(Date) });
      expect(hostedGateway.createCheckout).not.toHaveBeenCalled();
      expect(hostedGateway.assertCheckoutAmount).not.toHaveBeenCalled();
      expect(paymentGateway.processCard).not.toHaveBeenCalled();
    },
  );

  it('salva a referência sem devolver o link se a reserva expirar durante a criação', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    hostedGateway.createCheckout.mockImplementationOnce(async () => {
      await reservationsRepository.update(reservation.id, {
        createdAt: new Date('2000-01-01T00:00:00Z'),
        expiresAt: new Date('2000-01-01T00:10:00Z'),
      });
      return {
        externalReference: 'cs_test_after_hold',
        checkoutUrl: 'https://checkout.stripe.com/test',
      };
    });

    const response = await startHostedRequest(reservation.id, cookie)
      .send({ method: PaymentMethod.Card })
      .expect(201);

    expect(response.body).toMatchObject({
      status: PaymentStatus.Pending,
      checkoutUrl: null,
      canResume: false,
    });
    await expect(
      paymentsRepository.findOneByOrFail({ id: response.body.id }),
    ).resolves.toMatchObject({
      provider: PaymentProvider.Stripe,
      externalReference: 'cs_test_after_hold',
    });
  });

  async function createPendingHostedPayment(
    reservation: Reservation,
    externalReference: string | null,
    method = PaymentMethod.Card,
  ): Promise<Payment> {
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
    return paymentsRepository.save({
      reservationId: reservation.id,
      method,
      provider: PaymentProvider.Stripe,
      status: PaymentStatus.Pending,
      idempotencyKey: randomUUID(),
      amountCents: items.reduce((total, item) => total + item.unitPriceCents, 0),
      currency: PaymentCurrency.Brl,
      externalReference,
    });
  }

  function sendHostedNotification(
    paymentId: string,
    externalReference: string,
    options: { validSignature?: boolean; livemode?: boolean; type?: StripeCheckoutEventType } = {},
  ) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(
      {
        type: options.type ?? StripeCheckoutEventType.Completed,
        livemode: options.livemode ?? false,
        data: {
          object: {
            object: StripeCheckoutObject.Session,
            id: externalReference,
            livemode: false,
            client_reference_id: paymentId,
            payment_status: 'unpaid',
          },
        },
      },
      null,
      2,
    );
    const signature = createHmac('sha256', webhookFixtureSecret)
      .update(`${timestamp}.${payload}${options.validSignature === false ? ' ' : ''}`)
      .digest('hex');
    return request(app.getHttpServer())
      .post(webhookEndpoint)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', `t=${timestamp},v1=${signature}`)
      .send(payload);
  }

  function reportHostedPaymentAsPaid(paymentId: string, externalPaymentReference: string): void {
    hostedGateway.retrievePaymentOutcome.mockImplementation(async (attempt) =>
      attempt.paymentId === paymentId
        ? { status: HostedPaymentOutcomeStatus.Paid, externalPaymentReference }
        : { status: HostedPaymentOutcomeStatus.Pending, canExpire: false },
    );
  }

  it('converge com notificações repetidas e fora de ordem concorrendo com a conciliação SEATED', async () => {
    const reservation = await createActiveReservation(undefined, 2);
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    reportHostedPaymentAsPaid(payment.id, externalPaymentReference);

    await Promise.all([
      sendHostedNotification(payment.id, externalReference).expect(204),
      sendHostedNotification(payment.id, externalReference, {
        type: StripeCheckoutEventType.Expired,
      }).expect(204),
      reconciliation.reconcilePendingBatch(),
    ]);

    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
    await expect(
      ticketsRepository.countBy({ reservationItemId: In(items.map(({ id }) => id)) }),
    ).resolves.toBe(2);
    await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
      status: PaymentStatus.Approved,
      approvedAt: expect.any(Date),
      externalPaymentReference,
    });
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it('recusa assinatura, modo live e referência divergente antes de conciliar', async () => {
    const reservation = await createActiveReservation();
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await createPendingHostedPayment(reservation, externalReference);

    await sendHostedNotification(payment.id, externalReference, { validSignature: false }).expect(
      400,
    );
    await sendHostedNotification(payment.id, externalReference, { livemode: true }).expect(400);
    await sendHostedNotification(payment.id, 'cs_test_other_session').expect(503);
    expect(hostedGateway.retrievePaymentOutcome).not.toHaveBeenCalled();
    await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
      status: PaymentStatus.Pending,
      externalReference,
    });
  });

  it('retoma o mesmo estorno após timeout e consulta a confirmação sem repetir o POST após a retenção', async () => {
    const reservation = await createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    const refundReference = `pyr_${randomUUID()}`;
    reportHostedPaymentAsPaid(payment.id, externalPaymentReference);
    await sendHostedNotification(payment.id, externalReference).expect(204);
    await sendHostedNotification(payment.id, externalReference).expect(204);
    const refund = await refundsRepository.findOneByOrFail({ paymentId: payment.id });

    hostedGateway.createRefund.mockRejectedValueOnce(new HostedCheckoutUnavailableError());
    await refundReconciliation.reconcilePendingBatch();
    const attempted = await refundsRepository.findOneByOrFail({ id: refund.id });
    expect(attempted).toMatchObject({
      status: RefundStatus.Pending,
      externalReference: null,
      externalStartedAt: expect.any(Date),
      completedAt: null,
    });
    expect(hostedGateway.createRefund).toHaveBeenCalledWith(
      {
        refundId: refund.id,
        externalPaymentReference,
        amountCents: payment.amountCents,
        currency: PaymentCurrency.Brl,
      },
      attempted.externalStartedAt,
    );

    const restarted = new HostedRefundReconciliationService(dataSource, hostedGateway);
    await refundsRepository.update(refund.id, {
      externalStartedAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    hostedGateway.findRefund.mockResolvedValueOnce({
      externalReference: refundReference,
      status: RefundStatus.Pending,
    });
    await restarted.reconcilePendingBatch();
    await expect(refundsRepository.findOneByOrFail({ id: refund.id })).resolves.toMatchObject({
      status: RefundStatus.Pending,
      externalReference: refundReference,
      completedAt: null,
    });

    hostedGateway.retrieveRefund.mockResolvedValueOnce({
      externalReference: refundReference,
      status: RefundStatus.Completed,
    });
    await restarted.reconcilePendingBatch();
    await expect(refundsRepository.findBy({ paymentId: payment.id })).resolves.toEqual([
      expect.objectContaining({
        id: refund.id,
        status: RefundStatus.Completed,
        completedAt: expect.any(Date),
        failedAt: null,
      }),
    ]);
    expect(hostedGateway.createRefund).toHaveBeenCalledTimes(1);
    await expect(
      app.get(EventsService).findOrganizerEventById(organizer.id, reservation.eventId),
    ).resolves.toMatchObject({
      soldTickets: 0,
      revenueCents: 0,
    });
  });

  it('recupera o POST com a mesma chave no retry e renova após retenção com ausência comprovada', async () => {
    const reservation = await createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    reportHostedPaymentAsPaid(payment.id, externalPaymentReference);
    await sendHostedNotification(payment.id, externalReference).expect(204);
    const refund = await refundsRepository.findOneByOrFail({ paymentId: payment.id });
    const request = {
      refundId: refund.id,
      externalPaymentReference,
      amountCents: payment.amountCents,
      currency: PaymentCurrency.Brl,
    };
    const refundReference = `pyr_${randomUUID()}`;
    hostedGateway.createRefund.mockRejectedValue(new HostedCheckoutUnavailableError());
    hostedGateway.findRefund.mockResolvedValue(null);

    await refundReconciliation.reconcilePendingBatch();
    const first = await refundsRepository.findOneByOrFail({ id: refund.id });
    const restarted = new HostedRefundReconciliationService(dataSource, hostedGateway);
    await restarted.reconcilePendingBatch();
    expect(hostedGateway.createRefund).toHaveBeenNthCalledWith(1, request, first.externalStartedAt);
    expect(hostedGateway.createRefund).toHaveBeenNthCalledWith(2, request, first.externalStartedAt);

    const expired = new Date('2020-01-01T00:00:00.000Z');
    await refundsRepository.update(refund.id, { externalStartedAt: expired });
    hostedGateway.createRefund.mockResolvedValueOnce({
      externalReference: refundReference,
      status: RefundStatus.Completed,
    });
    await restarted.reconcilePendingBatch();
    const recovered = await refundsRepository.findOneByOrFail({ id: refund.id });
    expect(recovered).toMatchObject({
      status: RefundStatus.Completed,
      externalReference: refundReference,
      completedAt: expect.any(Date),
    });
    expect(recovered.externalStartedAt!.getTime()).toBeGreaterThan(expired.getTime());
    expect(hostedGateway.createRefund).toHaveBeenNthCalledWith(
      3,
      request,
      recovered.externalStartedAt,
    );
    expect(hostedGateway.findRefund).toHaveBeenCalledTimes(2);
  });

  it('preserva a sessão aberta de uma reserva elegível', async () => {
    const reservation = await createActiveReservation();
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await createPendingHostedPayment(reservation, externalReference);
    hostedGateway.retrievePaymentOutcome.mockResolvedValue({
      status: HostedPaymentOutcomeStatus.Pending,
      canExpire: true,
    });

    await sendHostedNotification(payment.id, externalReference).expect(204);

    expect(hostedGateway.expireCheckout).not.toHaveBeenCalled();
    await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
      status: PaymentStatus.Pending,
      externalReference,
    });
  });

  it.each(['hold expirado', 'reserva cancelada', 'evento cancelado'])(
    'encerra a sessão aberta quando %s sem inventar cobrança ou estorno',
    async (reason) => {
      const reservation =
        reason === 'hold expirado'
          ? await createActiveReservation(new Date('2020-01-01T00:10:00.000Z'))
          : await createActiveReservation();
      if (reason === 'reserva cancelada') {
        await reservationsRepository.update(reservation.id, { cancelledAt: new Date() });
      } else if (reason === 'evento cancelado') {
        await eventsRepository.update(reservation.eventId, {
          status: EventStatus.Cancelled,
          cancelledByUserId: organizer.id,
        });
      }
      const externalReference = `cs_test_${randomUUID()}`;
      const payment = await createPendingHostedPayment(reservation, externalReference);
      hostedGateway.retrievePaymentOutcome.mockResolvedValue({
        status: HostedPaymentOutcomeStatus.Pending,
        canExpire: true,
      });
      hostedGateway.expireCheckout.mockResolvedValueOnce({
        status: HostedPaymentOutcomeStatus.Closed,
      });

      await sendHostedNotification(payment.id, externalReference).expect(204);

      expect(hostedGateway.expireCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: payment.id }),
        externalReference,
      );
      await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
        status: PaymentStatus.Failed,
        externalPaymentReference: null,
      });
      await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
    },
  );

  it('registra a corrida de cobrança durante a expiração e mantém uma intenção de estorno', async () => {
    const reservation = await createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    hostedGateway.retrievePaymentOutcome.mockResolvedValue({
      status: HostedPaymentOutcomeStatus.Paid,
      externalPaymentReference,
    });
    hostedGateway.retrievePaymentOutcome.mockResolvedValueOnce({
      status: HostedPaymentOutcomeStatus.Pending,
      canExpire: true,
    });
    hostedGateway.expireCheckout.mockResolvedValueOnce({
      status: HostedPaymentOutcomeStatus.Paid,
      externalPaymentReference,
    });

    await sendHostedNotification(payment.id, externalReference).expect(204);
    await sendHostedNotification(payment.id, externalReference).expect(204);

    expect(hostedGateway.expireCheckout).toHaveBeenCalledTimes(1);
    const item = await reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    await expect(ticketsRepository.countBy({ reservationItemId: item.id })).resolves.toBe(0);
    await expect(refundsRepository.findBy({ paymentId: payment.id })).resolves.toEqual([
      expect.objectContaining({
        status: RefundStatus.Pending,
        amountCents: payment.amountCents,
        completedAt: null,
      }),
    ]);
  });

  it('concilia confirmação GA concorrente com webhooks e mantém exclusiva a capacidade vendida', async () => {
    const gaVenue = await dataSource
      .getRepository(Venue)
      .findOneByOrFail({ admissionMode: AdmissionMode.GeneralAdmission });
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: gaVenue.id,
      title: 'Conciliação GA',
      category: EventCategory.Show,
      admissionMode: AdmissionMode.GeneralAdmission,
      status: EventStatus.Published,
      startsAt: new Date('2099-10-01T23:30:00.000Z'),
      capacity: 2,
      priceCents: 2590,
      catalogSource: CatalogSource.Ticketmaster,
      externalId: randomUUID(),
    });
    createdEventIds.push(event.id);
    const cookie = await authenticate();
    const otherCookie = await authenticate(customerTwo);
    const hold = await request(app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', cookie)
      .send({ eventId: event.id, quantity: 2 })
      .expect(201);
    const reservation = await reservationsRepository.findOneByOrFail({ id: hold.body.id });
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await createPendingHostedPayment(
      reservation,
      externalReference,
      PaymentMethod.Pix,
    );
    reportHostedPaymentAsPaid(payment.id, `pi_${randomUUID()}`);

    await Promise.all([
      reconciliation.reconcilePendingBatch(),
      sendHostedNotification(payment.id, externalReference).expect(204),
      sendHostedNotification(payment.id, externalReference).expect(204),
      request(app.getHttpServer())
        .post('/reservations/general-admission')
        .set('Cookie', otherCookie)
        .send({ eventId: event.id, quantity: 1 })
        .expect(409),
    ]);

    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
    await expect(
      ticketsRepository.countBy({ reservationItemId: In(items.map(({ id }) => id)) }),
    ).resolves.toBe(2);
    await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
      status: PaymentStatus.Approved,
    });
    await request(app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', otherCookie)
      .send({ eventId: event.id, quantity: 1 })
      .expect(409);
    expect(seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it.each(['prazo expirado', 'hold perdido'])(
    'preserva cobrança tardia sem emitir Tickets após %s',
    async (reason) => {
      const reservation =
        reason === 'prazo expirado'
          ? await createActiveReservation(new Date('2020-01-01T00:10:00.000Z'), 2)
          : await createActiveReservation(undefined, 2);
      const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
      if (reason === 'hold perdido') {
        await eventSeatsRepository.update(items[0].eventSeatId!, {
          holdReservationId: null,
          holdExpiresAt: null,
        });
      }
      const payment = await createPendingHostedPayment(reservation, null);
      const externalReference = `cs_test_${randomUUID()}`;
      const externalPaymentReference = `pi_${randomUUID()}`;
      reportHostedPaymentAsPaid(payment.id, externalPaymentReference);

      await sendHostedNotification(payment.id, externalReference).expect(204);
      await sendHostedNotification(payment.id, externalReference).expect(204);

      await expect(
        ticketsRepository.countBy({ reservationItemId: In(items.map(({ id }) => id)) }),
      ).resolves.toBe(0);
      await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
        status: PaymentStatus.Failed,
        externalReference,
        externalPaymentReference,
        failedAt: expect.any(Date),
      });
      await expect(eventSeatsRepository.findBy({ eventId: reservation.eventId })).resolves.toEqual(
        expect.arrayContaining(
          items.map(({ eventSeatId }) =>
            expect.objectContaining({ id: eventSeatId, soldAt: null }),
          ),
        ),
      );
      expect(seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
    },
  );

  it('reverte a venda se o hold vencer enquanto a conciliação Stripe aguarda o lock do assento', async () => {
    const reservation = await createActiveReservation();
    const item = await reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    reportHostedPaymentAsPaid(payment.id, externalPaymentReference);

    const response = await requestWaitingPastDeadline(
      sendHostedNotification(payment.id, externalReference),
      (manager) =>
        manager.getRepository(EventSeat).findOneOrFail({
          where: { id: item.eventSeatId! },
          lock: { mode: 'pessimistic_write' },
        }),
      // Grava o prazo em outra conexão. A conciliação só deve ficar bloqueada ao atualizar o assento.
      (_manager, deadline) =>
        reservationsRepository.update(reservation.id, { expiresAt: deadline }),
    );

    expect(response.status).toBe(204);
    await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
      status: PaymentStatus.Failed,
      externalPaymentReference,
    });
    await expect(
      reservationsRepository.findOneByOrFail({ id: reservation.id }),
    ).resolves.toMatchObject({ confirmedAt: null });
    await expect(ticketsRepository.countBy({ reservationItemId: item.id })).resolves.toBe(0);
    await expect(
      eventSeatsRepository.findOneByOrFail({ id: item.eventSeatId! }),
    ).resolves.toMatchObject({ soldAt: null, holdReservationId: reservation.id });
    expect(seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it.each(['reserva', 'evento'])(
    'registra estorno Stripe pendente no cancelamento de %s',
    async (target) => {
      const reservation = await createActiveReservation();
      const externalReference = `cs_test_${randomUUID()}`;
      const payment = await createPendingHostedPayment(reservation, externalReference);
      const externalPaymentReference = `pi_${randomUUID()}`;
      reportHostedPaymentAsPaid(payment.id, externalPaymentReference);
      await sendHostedNotification(payment.id, externalReference).expect(204);

      const isEventCancellation = target === 'evento';
      const cookie = await authenticate(isEventCancellation ? organizer : customer);
      const path = isEventCancellation
        ? `/organizer/me/events/${reservation.eventId}/cancel`
        : `/reservations/${reservation.id}/cancel`;
      await request(app.getHttpServer())
        .post(path)
        .set('Cookie', cookie)
        .set('Origin', checkoutOrigin)
        .expect(200);

      await expect(refundsRepository.findBy({ paymentId: payment.id })).resolves.toEqual([
        expect.objectContaining({
          amountCents: payment.amountCents,
          status: RefundStatus.Pending,
          completedAt: null,
          failedAt: null,
        }),
      ]);
      await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
        status: PaymentStatus.Approved,
        externalPaymentReference,
      });
      const item = await reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      await expect(
        ticketsRepository.findOneByOrFail({ reservationItemId: item.id }),
      ).resolves.toMatchObject({ cancelledAt: expect.any(Date) });
      await expect(
        eventSeatsRepository.findOneByOrFail({ id: item.eventSeatId! }),
      ).resolves.toMatchObject({ soldAt: null });
      const events = app.get(EventsService);
      await expect(
        events.findOrganizerEventById(organizer.id, reservation.eventId),
      ).resolves.toMatchObject({ revenueCents: payment.amountCents });
      hostedGateway.createRefund.mockImplementation(
        async ({ externalPaymentReference: charge }) => {
          if (charge !== externalPaymentReference) throw new HostedCheckoutUnavailableError();
          return { status: RefundStatus.Completed, externalReference: `re_${randomUUID()}` };
        },
      );
      const refundWorker = new HostedRefundReconciliationService(dataSource, hostedGateway);
      await refundWorker.reconcilePendingBatch();
      await expect(
        events.findOrganizerEventById(organizer.id, reservation.eventId),
      ).resolves.toMatchObject({ revenueCents: 0 });
    },
  );

  async function waitForBlockedTransaction(pid: number): Promise<void> {
    for (let attempt = 0; attempt < lockPollAttempts; attempt++) {
      const [{ blocked }] = (await dataSource.query(
        'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',
        [pid],
      )) as Array<{ blocked: boolean }>;
      if (blocked) return;
      await delay(lockPollIntervalMilliseconds);
    }

    throw new Error('Nenhuma transação aguardou o lock observado');
  }

  async function cancelAfterDeadline(
    cancellation: HttpRequest,
    acquireLock: (manager: EntityManager) => Promise<unknown>,
    setDeadline: (manager: EntityManager, deadline: Date) => Promise<unknown>,
  ): Promise<HttpResponse> {
    const locker = dataSource.createQueryRunner();
    await locker.connect();
    let response: Promise<HttpResponse> | undefined;

    try {
      await locker.startTransaction();
      await acquireLock(locker.manager);
      const [{ pid }] = (await locker.query('SELECT pg_backend_pid() AS pid')) as Array<{
        pid: number;
      }>;
      response = cancellation.then((result) => result);
      await waitForBlockedTransaction(pid);

      // Coloca o prazo entre o início da transação bloqueada e a liberação do lock.
      const [{ deadline }] = (await locker.query(
        `SELECT date_trunc('milliseconds', clock_timestamp()) + $1::int * interval '1 millisecond' AS deadline`,
        [deadlineAfterLockObservedMilliseconds],
      )) as Array<{ deadline: Date }>;
      await setDeadline(locker.manager, deadline);
      await locker.query('SELECT pg_sleep_until($1::timestamptz)', [deadline]);
      await locker.commitTransaction();
      return await response;
    } finally {
      if (locker.isTransactionActive) await locker.rollbackTransaction();
      await locker.release();
      await response;
    }
  }

  async function requestWaitingPastDeadline(
    pendingRequest: HttpRequest,
    acquireLock: (manager: EntityManager) => Promise<unknown>,
    setDeadline: (manager: EntityManager, deadline: Date) => Promise<unknown>,
  ): Promise<HttpResponse> {
    const locker = dataSource.createQueryRunner();
    await locker.connect();
    let response: Promise<HttpResponse> | undefined;

    try {
      await locker.startTransaction();
      await acquireLock(locker.manager);
      const [{ pid, deadline }] = (await locker.query(
        `SELECT pg_backend_pid() AS pid,
                date_trunc('milliseconds', clock_timestamp()) + $1::int * interval '1 millisecond' AS deadline`,
        [deadlineBeforeRequestMilliseconds],
      )) as Array<{ pid: number; deadline: Date }>;
      await setDeadline(locker.manager, deadline);
      response = pendingRequest.then((result) => result);
      await waitForBlockedTransaction(pid);

      const [{ beforeDeadline }] = (await locker.query(
        'SELECT clock_timestamp() < $1::timestamptz AS "beforeDeadline"',
        [deadline],
      )) as Array<{ beforeDeadline: boolean }>;
      expect(beforeDeadline).toBe(true);
      await locker.query('SELECT pg_sleep_until($1::timestamptz)', [deadline]);
      await locker.commitTransaction();
      return await response;
    } finally {
      if (locker.isTransactionActive) await locker.rollbackTransaction();
      await locker.release();
      await response;
    }
  }

  async function createConfirmedReservation(cookie: string): Promise<Reservation> {
    const reservation = await createActiveReservation();
    await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);
    return reservationsRepository.findOneByOrFail({ id: reservation.id });
  }

  it('persiste PENDING antes do gateway e não o chama outra vez para a mesma key', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const idempotencyKey = randomUUID();
    let resolveGateway!: (result: CardPaymentGatewayResult) => void;
    let notifyGatewayStarted!: () => void;
    const gatewayStarted = new Promise<void>((resolve) => {
      notifyGatewayStarted = resolve;
    });
    const gatewayResult = new Promise<CardPaymentGatewayResult>((resolve) => {
      resolveGateway = resolve;
    });
    paymentGateway.processCard.mockImplementationOnce(async () => {
      notifyGatewayStarted();
      return gatewayResult;
    });

    const firstResponsePromise = createPaymentRequest(reservation.id, idempotencyKey, cookie)
      .expect(201)
      .then((response) => response);
    await gatewayStarted;
    const pendingPayment = await paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const retryResponse = await createPaymentRequest(reservation.id, idempotencyKey, cookie).expect(
      201,
    );
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    const firstResponse = await firstResponsePromise;
    const completedRetryResponse = await createPaymentRequest(
      reservation.id,
      idempotencyKey,
      cookie,
    ).expect(201);

    expect(pendingPayment).toMatchObject({
      reservationId: reservation.id,
      status: PaymentStatus.Pending,
      provider: PaymentProvider.Fake,
      amountCents: 2590,
      currency: PaymentCurrency.Brl,
      externalReference: null,
      approvedAt: null,
      failedAt: null,
    });
    expect(retryResponse.body).toMatchObject({
      id: firstResponse.body.id,
      status: PaymentStatus.Pending,
    });
    expect(firstResponse.body.status).toBe(PaymentStatus.Approved);
    expect(completedRetryResponse.body).toMatchObject({
      id: firstResponse.body.id,
      status: PaymentStatus.Approved,
    });
    expect(paymentGateway.processCard).toHaveBeenCalledTimes(1);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it('rejeita key diferente enquanto existir Payment PENDING', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    let resolveGateway!: (result: CardPaymentGatewayResult) => void;
    let notifyGatewayStarted!: () => void;
    const gatewayStarted = new Promise<void>((resolve) => {
      notifyGatewayStarted = resolve;
    });
    const gatewayResult = new Promise<CardPaymentGatewayResult>((resolve) => {
      resolveGateway = resolve;
    });
    paymentGateway.processCard.mockImplementationOnce(async () => {
      notifyGatewayStarted();
      return gatewayResult;
    });

    const firstPaymentPromise = createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(201)
      .then((response) => response);
    await gatewayStarted;
    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(409);
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    await firstPaymentPromise;

    expect(response.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect(paymentGateway.processCard).toHaveBeenCalledTimes(1);
  });

  it('finaliza PENDING órfão como FAILED antes de permitir nova tentativa', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const orphanedPayment = await paymentsRepository.save({
      reservationId: reservation.id,
      method: PaymentMethod.Card,
      provider: PaymentProvider.Fake,
      status: PaymentStatus.Pending,
      idempotencyKey: randomUUID(),
      amountCents: 2590,
      currency: PaymentCurrency.Brl,
      approvedAt: null,
      failedAt: null,
    });
    await paymentsRepository.update(orphanedPayment.id, {
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const newPaymentResponse = await createPaymentRequest(
      reservation.id,
      randomUUID(),
      cookie,
    ).expect(201);
    const recoveredPayment = await paymentsRepository.findOneByOrFail({ id: orphanedPayment.id });

    expect(recoveredPayment).toMatchObject({ status: PaymentStatus.Failed });
    expect(recoveredPayment.failedAt).not.toBeNull();
    expect(newPaymentResponse.body.status).toBe(PaymentStatus.Approved);
  });

  it('mantém o cartão Stripe pendente após a janela técnica do cartão fake', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const payment = await paymentsRepository.save({
      reservationId: reservation.id,
      method: PaymentMethod.Card,
      provider: PaymentProvider.Stripe,
      status: PaymentStatus.Pending,
      idempotencyKey: randomUUID(),
      amountCents: 2590,
      currency: PaymentCurrency.Brl,
      createdAt: new Date('2000-01-01T00:00:00Z'),
    });

    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(409);

    expect(response.body.code).toBe('PAYMENT_IN_PROGRESS');
    await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
      status: PaymentStatus.Pending,
      failedAt: null,
      externalReference: null,
    });
    expect(paymentGateway.processCard).not.toHaveBeenCalled();
  });

  it('persiste PIX Stripe sem simulação e vincula cada referência externa a uma única tentativa', async () => {
    const firstReservation = await createActiveReservation();
    const secondReservation = await createActiveReservation();
    const pendingStripePix = {
      method: PaymentMethod.Pix,
      provider: PaymentProvider.Stripe,
      status: PaymentStatus.Pending,
      amountCents: 2590,
      currency: PaymentCurrency.Brl,
    };
    const first = await paymentsRepository.save({
      ...pendingStripePix,
      reservationId: firstReservation.id,
      idempotencyKey: randomUUID(),
    });
    const second = await paymentsRepository.save({
      ...pendingStripePix,
      reservationId: secondReservation.id,
      idempotencyKey: randomUUID(),
    });

    const externalReference = `session-${randomUUID()}`;
    await paymentsRepository.update(first.id, { externalReference });
    await expect(paymentsRepository.update(second.id, { externalReference })).rejects.toMatchObject(
      {
        driverError: { constraint: 'paymentsProviderExternalReferenceUnique' },
      },
    );
    await expect(
      paymentsRepository.update(first.id, { simulationCompletionAt: new Date() }),
    ).rejects.toMatchObject({
      driverError: { constraint: 'paymentsSimulationCompletionMatchesProviderAndMethod' },
    });

    const cookie = await authenticate();
    await request(app.getHttpServer())
      .get(`/reservations/${firstReservation.id}/payments/pix`)
      .set('Cookie', cookie)
      .expect(404);
    await settlePixRequest(firstReservation.id, first.id, cookie)
      .set('Origin', checkoutOrigin)
      .expect(404);
    await expect(paymentsRepository.findOneByOrFail({ id: first.id })).resolves.toMatchObject({
      externalReference,
      simulationCompletionAt: null,
      status: PaymentStatus.Pending,
    });
  });

  it('persiste uma única tentativa PIX em retries simultâneos, com prazo e QR estáveis', async () => {
    const reservation = await createActiveReservation(undefined, 2);
    const idempotencyKey = randomUUID();
    const [{ now: before }] = (await dataSource.query('SELECT clock_timestamp() AS now')) as Array<{
      now: Date;
    }>;

    const [first, retry] = await Promise.all([
      paymentsService.createSimulatedPixPayment(customer.id, reservation.id, idempotencyKey),
      paymentsService.createSimulatedPixPayment(customer.id, reservation.id, idempotencyKey),
    ]);

    const [{ now: after }] = (await dataSource.query('SELECT clock_timestamp() AS now')) as Array<{
      now: Date;
    }>;
    const persisted = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
    expect(persisted).toMatchObject({
      id: first.payment.id,
      method: PaymentMethod.Pix,
      provider: PaymentProvider.Fake,
      status: PaymentStatus.Pending,
      idempotencyKey,
      amountCents: 5180,
      currency: PaymentCurrency.Brl,
      externalReference: null,
      approvedAt: null,
      failedAt: null,
      simulationCompletionAt: expect.any(Date),
    });
    expect(persisted.simulationCompletionAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime() + 15_000,
    );
    expect(persisted.simulationCompletionAt?.getTime()).toBeLessThanOrEqual(
      after.getTime() + 15_000,
    );
    expect(first.qrCodePayload).toBe(`ntq:pix:simulado:${persisted.id}`);
    expect(retry).toEqual({ payment: persisted, qrCodePayload: first.qrCodePayload });
    expect(await paymentsRepository.countBy({ reservationId: reservation.id })).toBe(1);
    await expect(
      paymentsRepository.update(persisted.id, { simulationCompletionAt: null }),
    ).rejects.toMatchObject({
      driverError: { constraint: 'paymentsSimulationCompletionMatchesProviderAndMethod' },
    });
    expect(paymentGateway.processCard).not.toHaveBeenCalled();
  });

  it('preserva o PIX PENDING após a janela técnica do cartão e reutiliza a chave entre métodos', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const idempotencyKey = randomUUID();
    const { payment } = await paymentsService.createSimulatedPixPayment(
      customer.id,
      reservation.id,
      idempotencyKey,
    );
    await paymentsRepository.update(payment.id, { createdAt: new Date('2000-01-01T00:00:00Z') });

    const conflict = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(409);
    const retry = await createPaymentRequest(reservation.id, idempotencyKey, cookie).expect(201);
    const persisted = await paymentsRepository.findOneByOrFail({ id: payment.id });

    expect(conflict.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect(retry.body).toMatchObject({
      id: payment.id,
      method: PaymentMethod.Pix,
      status: PaymentStatus.Pending,
    });
    expect(persisted.status).toBe(PaymentStatus.Pending);
    expect(persisted.simulationCompletionAt).toEqual(payment.simulationCompletionAt);
    expect(paymentGateway.processCard).not.toHaveBeenCalled();
  });

  it('serializa a criação concorrente de cartão e PIX com chaves diferentes', async () => {
    const reservation = await createActiveReservation();
    const [card, pix] = await Promise.allSettled([
      paymentsService.processCardPayment(customer.id, reservation.id, randomUUID(), {
        cardNumber: '4242424242424242',
        cardholderName: 'Ana Beatriz Souza',
        expiry: '08/29',
        cvv: '123',
      }),
      paymentsService.createSimulatedPixPayment(customer.id, reservation.id, randomUUID()),
    ]);

    const persisted = await paymentsRepository.findBy({ reservationId: reservation.id });
    expect(persisted).toHaveLength(1);
    const winner = persisted[0];
    await expect(
      paymentsRepository.insert({
        reservationId: reservation.id,
        method: PaymentMethod.Card,
        provider: PaymentProvider.Stripe,
        status: PaymentStatus.Pending,
        idempotencyKey: randomUUID(),
        amountCents: winner.amountCents,
        currency: PaymentCurrency.Brl,
        simulationCompletionAt: null,
      }),
    ).rejects.toMatchObject({
      driverError: { constraint: 'paymentsActiveReservationUnique' },
    });

    if (winner.method === PaymentMethod.Card) {
      expect(card).toMatchObject({
        status: 'fulfilled',
        value: { id: winner.id, status: PaymentStatus.Approved, simulationCompletionAt: null },
      });
      expect(pix.status).toBe('rejected');
      if (pix.status === 'rejected') {
        expect(
          pix.reason instanceof PaymentInProgressError ||
            pix.reason instanceof ReservationAlreadyPaidError,
        ).toBe(true);
      }
      expect(paymentGateway.processCard).toHaveBeenCalledTimes(1);
    } else {
      expect(pix).toMatchObject({
        status: 'fulfilled',
        value: { payment: { id: winner.id, status: PaymentStatus.Pending } },
      });
      expect(card).toMatchObject({
        status: 'rejected',
        reason: expect.any(PaymentInProgressError),
      });
      expect(paymentGateway.processCard).not.toHaveBeenCalled();
    }
  });

  it('rejeita Reservation expirada sem criar Payment', async () => {
    const reservation = await createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const cookie = await authenticate();

    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(409);

    expect(response.body.code).toBe('RESERVATION_EXPIRED');
    await expect(paymentsRepository.countBy({ reservationId: reservation.id })).resolves.toBe(0);
  });

  it('não confirma a Reservation quando o hold vence enquanto a finalização aguarda um lock', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const locker = dataSource.createQueryRunner();
    await locker.connect();
    await locker.startTransaction();

    const response = createPaymentRequest(reservation.id, randomUUID(), cookie);

    try {
      await locker.manager.getRepository(Event).findOneOrFail({
        where: { id: reservation.eventId },
        lock: { mode: 'pessimistic_write' },
      });
      const [{ pid }] = (await locker.query('SELECT pg_backend_pid() AS pid')) as Array<{
        pid: number;
      }>;
      const paymentResponse = response.then((result) => result);

      try {
        await waitForBlockedTransaction(pid);

        // Posiciona o vencimento entre o início da finalização e a aquisição do lock.
        const [{ expiresAt }] = (await locker.query(
          `SELECT date_trunc('milliseconds', clock_timestamp()) + interval '50 milliseconds' AS "expiresAt"`,
        )) as Array<{ expiresAt: Date }>;
        await locker.manager.getRepository(Reservation).update(reservation.id, { expiresAt });
        await locker.manager
          .getRepository(EventSeat)
          .update({ holdReservationId: reservation.id }, { holdExpiresAt: expiresAt });
        await locker.query('SELECT pg_sleep_until($1::timestamptz)', [expiresAt]);
        await locker.commitTransaction();
      } finally {
        if (locker.isTransactionActive) await locker.rollbackTransaction();
        await paymentResponse;
      }

      const result = await paymentResponse;
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({ status: PaymentStatus.Failed, approvedAt: null });
    } finally {
      if (locker.isTransactionActive) await locker.rollbackTransaction();
      await locker.release();
    }

    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const seat = await eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId });
    const item = await reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });

    expect(persistedReservation.confirmedAt).toBeNull();
    expect(seat.soldAt).toBeNull();
    expect(await ticketsRepository.countBy({ reservationItemId: item.id })).toBe(0);
    expect(seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it('recupera a tentativa PIX e o mesmo QR em outra instância após encerrar a instância criadora', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const path = `/reservations/${reservation.id}/payments/pix`;
    const idempotencyKey = randomUUID();
    await request(app.getHttpServer()).get(path).set('Cookie', cookie).expect(404);

    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const creator = testingModule.createNestApplication();
    new Application().configure(creator);

    const created = await (async () => {
      try {
        await creator.init();
        return await createPixRequest(reservation.id, cookie, idempotencyKey, creator).expect(201);
      } finally {
        await creator.close();
      }
    })();

    const recovered = await request(app.getHttpServer())
      .get(path)
      .set('Cookie', cookie)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    const repeated = await createPixRequest(reservation.id, cookie, idempotencyKey).expect(201);

    expect(recovered.body).toEqual(created.body);
    expect(repeated.body).toEqual(created.body);
    expect(recovered.body).toMatchObject({
      method: PaymentMethod.Pix,
      status: PaymentStatus.Pending,
      simulationCompletionAt: expect.any(String),
      qrCodePayload: `ntq:pix:simulado:${created.body.id}`,
    });
    expect(recovered.body).not.toHaveProperty('idempotencyKey');
  });

  it('restringe criação, consulta e settlement do PIX ao dono da Reservation', async () => {
    const reservation = await createActiveReservation();
    const otherReservation = await createActiveReservation();
    const [cookie, otherCookie] = await Promise.all([authenticate(), authenticate(customerTwo)]);
    const path = `/reservations/${reservation.id}/payments/pix`;

    await createPixRequest(reservation.id, otherCookie).expect(404);
    await createPixRequest(reservation.id, cookie, 'chave-invalida').expect(400);
    const created = await createPixRequest(reservation.id, cookie).expect(201);
    const paymentId = created.body.id as string;
    await paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });

    await request(app.getHttpServer()).get(path).set('Cookie', otherCookie).expect(404);
    await settlePixRequest(reservation.id, paymentId, otherCookie)
      .set('Origin', checkoutOrigin)
      .expect(404);
    await settlePixRequest(otherReservation.id, paymentId, cookie)
      .set('Origin', checkoutOrigin)
      .expect(404);
    await request(app.getHttpServer()).post(`${path}/${paymentId}/settle`).expect(401);
    const payment = await paymentsRepository.findOneByOrFail({ id: paymentId });
    expect(payment.status).toBe(PaymentStatus.Pending);
  });

  it('rejeita POST de settlement com origem ausente, opaca ou fora da configuração', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const created = await createPixRequest(reservation.id, cookie).expect(201);
    const paymentId = created.body.id as string;
    await paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });

    for (const origin of [undefined, 'null', 'https://untrusted.example']) {
      const settlement = settlePixRequest(reservation.id, paymentId, cookie).type('form');
      if (origin !== undefined) settlement.set('Origin', origin);

      const response = await settlement.expect(403);
      expect(response.body.code).toBe('PAYMENT_ORIGIN_NOT_ALLOWED');
    }

    const recovered = await request(app.getHttpServer())
      .get(`/reservations/${reservation.id}/payments/pix`)
      .set('Cookie', cookie)
      .expect(200);
    expect(recovered.body.status).toBe(PaymentStatus.Pending);
    expect(seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it('relê o prazo PIX sob os locks e confirma uma única vez em settlements concorrentes', async () => {
    const reservation = await createActiveReservation(undefined, 2);
    const cookie = await authenticate();
    const created = await createPixRequest(reservation.id, cookie).expect(201);
    const paymentId = created.body.id as string;
    await paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });
    const locker = dataSource.createQueryRunner();
    await locker.connect();
    await locker.startTransaction();

    try {
      await locker.manager.getRepository(Event).findOneOrFail({
        where: { id: reservation.eventId },
        lock: { mode: 'pessimistic_write' },
      });
      const [{ pid }] = (await locker.query('SELECT pg_backend_pid() AS pid')) as Array<{
        pid: number;
      }>;
      const settlement = settlePixRequest(reservation.id, paymentId, cookie)
        .set('Origin', checkoutOrigin)
        .expect(200)
        .then((result) => result);

      try {
        await waitForBlockedTransaction(pid);
        await locker.manager.getRepository(Payment).update(paymentId, {
          simulationCompletionAt: new Date('2099-01-01T00:00:00Z'),
        });
        await locker.commitTransaction();
      } finally {
        if (locker.isTransactionActive) await locker.rollbackTransaction();
        await settlement;
      }

      expect((await settlement).body.status).toBe(PaymentStatus.Pending);
    } finally {
      if (locker.isTransactionActive) await locker.rollbackTransaction();
      await locker.release();
    }

    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
    const ticketCriteria = { reservationItemId: In(items.map(({ id }) => id)) };
    expect(await ticketsRepository.countBy(ticketCriteria)).toBe(0);

    await paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });
    const [approved, retry] = await Promise.all([
      settlePixRequest(reservation.id, paymentId, cookie).set('Origin', checkoutOrigin).expect(200),
      settlePixRequest(reservation.id, paymentId, cookie).set('Origin', checkoutOrigin).expect(200),
    ]);

    expect(approved.body.status).toBe(PaymentStatus.Approved);
    expect(retry.body).toEqual(approved.body);
    expect(await ticketsRepository.countBy(ticketCriteria)).toBe(2);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it.each(['expirada', 'cancelada'])(
    'encerra o PIX sem Tickets quando a Reservation está %s',
    async (state) => {
      const reservation = await createActiveReservation();
      const cookie = await authenticate();
      const created = await createPixRequest(reservation.id, cookie).expect(201);
      const paymentId = created.body.id as string;
      await paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });

      if (state === 'cancelada') {
        await request(app.getHttpServer())
          .post(`/reservations/${reservation.id}/cancel`)
          .set('Origin', checkoutOrigin)
          .set('Cookie', cookie)
          .expect(200);
      } else {
        await reservationsRepository.update(reservation.id, {
          createdAt: new Date('2000-01-01T00:00:00Z'),
          expiresAt: new Date('2000-01-01T00:10:00Z'),
        });
      }

      const settlement = await settlePixRequest(reservation.id, paymentId, cookie)
        .set('Origin', checkoutOrigin)
        .expect(200);
      const item = await reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const seat = await eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId });

      expect(settlement.body).toMatchObject({ status: PaymentStatus.Failed, approvedAt: null });
      expect(seat.soldAt).toBeNull();
      expect(await ticketsRepository.countBy({ reservationItemId: item.id })).toBe(0);
    },
  );

  it('recusa o cartão sem confirmar a Reservation ou emitir Ticket', async () => {
    paymentGateway.processCard.mockResolvedValueOnce({ status: CardPaymentGatewayStatus.Declined });
    const reservation = await createActiveReservation();
    const cookie = await authenticate();

    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);
    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });

    expect(response.body.status).toBe(PaymentStatus.Declined);
    expect(persistedReservation.confirmedAt).toBeNull();
    await expect(ticketsRepository.countBy({ reservationItemId: items[0].id })).resolves.toBe(0);
    expect(seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it('confirma a Reservation, vende o assento e cria Ticket com o price snapshot', async () => {
    const reservation = await createActiveReservation();
    const event = await eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const cookie = await authenticate();
    event.priceCents = 9999;
    await eventsRepository.save(event);

    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);
    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const eventSeat = await eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId });
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });

    expect(response.body).toMatchObject({ status: PaymentStatus.Approved, amountCents: 2590 });
    expect(persistedReservation.confirmedAt).not.toBeNull();
    expect(eventSeat.soldAt).not.toBeNull();
    expect(eventSeat.holdReservationId).toBeNull();
    await expect(ticketsRepository.countBy({ reservationItemId: items[0].id })).resolves.toBe(1);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledWith({
      eventId: reservation.eventId,
      eventSeatIds: [eventSeat.id],
    });
  });

  it('emite credenciais individuais para cada ReservationItem confirmado', async () => {
    const reservation = await createActiveReservation(undefined, 2);
    const cookie = await authenticate();

    await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);

    const items = await reservationItemsRepository.find({
      where: { reservationId: reservation.id },
      order: { createdAt: 'ASC' },
    });
    const tickets = await ticketsRepository.find({
      where: { reservationItemId: In(items.map((item) => item.id)) },
      order: { createdAt: 'ASC' },
    });

    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((ticket) => ticket.reservationItemId)).size).toBe(2);
    expect(new Set(tickets.map((ticket) => ticket.publicId)).size).toBe(2);
    expect(new Set(tickets.map((ticket) => ticket.manualCode)).size).toBe(2);
    for (const ticket of tickets) {
      expect(ticket.publicId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(ticket.manualCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
    expect(
      new Set(tickets.map((ticket) => ticketCredentialService.createCredential(ticket.publicId)))
        .size,
    ).toBe(2);
    const eventSeatIds = items
      .map((item) => item.eventSeatId)
      .filter((eventSeatId): eventSeatId is string => eventSeatId !== null);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledWith({
      eventId: reservation.eventId,
      eventSeatIds: expect.arrayContaining(eventSeatIds),
    });
    const [soldDelta] = jest.mocked(seatRealtimeGateway.emitSold).mock.calls[0];
    expect(soldDelta.eventSeatIds).toHaveLength(2);
  });

  it('marca falha técnica e permite nova tentativa intencional', async () => {
    paymentGateway.processCard.mockRejectedValueOnce(new Error('gateway indisponível'));
    const reservation = await createActiveReservation();
    const cookie = await authenticate();

    const failedResponse = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(
      201,
    );
    const approvedResponse = await createPaymentRequest(
      reservation.id,
      randomUUID(),
      cookie,
    ).expect(201);

    expect(failedResponse.body.status).toBe(PaymentStatus.Failed);
    expect(approvedResponse.body.status).toBe(PaymentStatus.Approved);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it.each(['reserva', 'evento'])(
    'bloqueia origens não confiáveis no cancelamento de %s e aceita a origem da Web em outro domínio',
    async (target) => {
      const customerCookie = await authenticate();
      const reservation = await createConfirmedReservation(customerCookie);
      const isEventCancellation = target === 'evento';
      const cookie = isEventCancellation ? await authenticate(organizer) : customerCookie;
      const path = isEventCancellation
        ? `/organizer/me/events/${reservation.eventId}/cancel`
        : `/reservations/${reservation.id}/cancel`;
      const apiHost = 'api.example.invalid';
      const cancelRequest = () =>
        request(app.getHttpServer()).post(path).set('Host', apiHost).set('Cookie', cookie);

      await request(app.getHttpServer()).post(path).set('Origin', checkoutOrigin).expect(401);
      for (const origin of [undefined, 'null', 'https://untrusted.example.invalid']) {
        const cancellation = cancelRequest().type('form');
        if (origin !== undefined) cancellation.set('Origin', origin);

        const response = await cancellation.expect(403);
        expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
      }

      const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
      const item = await reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const ticket = await ticketsRepository.findOneByOrFail({ reservationItemId: item.id });
      const seat = await eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId });
      await expect(
        eventsRepository.findOneByOrFail({ id: reservation.eventId }),
      ).resolves.toMatchObject({
        status: EventStatus.Published,
      });
      await expect(
        reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({
        cancelledAt: null,
      });
      expect(payment.status).toBe(PaymentStatus.Approved);
      expect(ticket.cancelledAt).toBeNull();
      expect(seat.soldAt).not.toBeNull();
      await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);

      await cancelRequest()
        .set('Origin', checkoutOrigin)
        .expect('Access-Control-Allow-Origin', checkoutOrigin)
        .expect('Access-Control-Allow-Credentials', 'true')
        .expect(200);
      await expect(
        eventsRepository.findOneByOrFail({ id: reservation.eventId }),
      ).resolves.toMatchObject({
        status: isEventCancellation ? EventStatus.Cancelled : EventStatus.Published,
      });
      await expect(
        reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({
        cancelledAt: expect.any(Date),
      });
      await expect(ticketsRepository.findOneByOrFail({ id: ticket.id })).resolves.toMatchObject({
        cancelledAt: expect.any(Date),
      });
      await expect(eventSeatsRepository.findOneByOrFail({ id: seat.id })).resolves.toMatchObject({
        soldAt: null,
      });
      await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(1);
    },
  );

  it('recusa o cancelamento de uma reserva cujo hold vence enquanto aguarda o lock', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const cancellation = request(app.getHttpServer())
      .post(`/reservations/${reservation.id}/cancel`)
      .set('Origin', checkoutOrigin)
      .set('Cookie', cookie);

    const response = await cancelAfterDeadline(
      cancellation,
      (manager) =>
        manager.getRepository(Reservation).findOneOrFail({
          where: { id: reservation.id },
          lock: { mode: 'pessimistic_write' },
        }),
      async (manager, expiresAt) => {
        await manager.getRepository(Reservation).update(reservation.id, { expiresAt });
        await manager
          .getRepository(EventSeat)
          .update({ holdReservationId: reservation.id }, { holdExpiresAt: expiresAt });
      },
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('RESERVATION_NOT_ACTIVE');
    await expect(
      reservationsRepository.findOneByOrFail({ id: reservation.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId }),
    ).resolves.toMatchObject({ holdReservationId: reservation.id, soldAt: null });
  });

  it('recusa o cancelamento de uma compra se a janela de sete dias termina no lock do Payment', async () => {
    const cookie = await authenticate();
    const reservation = await createConfirmedReservation(cookie);
    const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
    const cancellation = request(app.getHttpServer())
      .post(`/reservations/${reservation.id}/cancel`)
      .set('Origin', checkoutOrigin)
      .set('Cookie', cookie);

    const response = await cancelAfterDeadline(
      cancellation,
      (manager) =>
        manager.getRepository(Payment).findOneOrFail({
          where: { id: payment.id },
          lock: { mode: 'pessimistic_write' },
        }),
      (manager, deadline) =>
        manager.getRepository(Payment).update(payment.id, {
          approvedAt: new Date(deadline.getTime() - sevenDaysInMilliseconds),
        }),
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CANCELLATION_NOT_ALLOWED');
    const item = await reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    await expect(
      reservationsRepository.findOneByOrFail({ id: reservation.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      ticketsRepository.findOneByOrFail({ reservationItemId: item.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId }),
    ).resolves.toMatchObject({ soldAt: expect.any(Date) });
    await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
  });

  it('recusa o cancelamento pelo organizador quando o evento começa durante a espera do lock', async () => {
    const [customerCookie, organizerCookie] = await Promise.all([
      authenticate(),
      authenticate(organizer),
    ]);
    const reservation = await createConfirmedReservation(customerCookie);
    const cancellation = request(app.getHttpServer())
      .post(`/organizer/me/events/${reservation.eventId}/cancel`)
      .set('Origin', checkoutOrigin)
      .set('Cookie', organizerCookie);

    const response = await cancelAfterDeadline(
      cancellation,
      (manager) =>
        manager.getRepository(Event).findOneOrFail({
          where: { id: reservation.eventId },
          lock: { mode: 'pessimistic_write' },
        }),
      (manager, startsAt) => manager.getRepository(Event).update(reservation.eventId, { startsAt }),
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EVENT_CANNOT_BE_CANCELLED');
    const item = await reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
    await expect(
      eventsRepository.findOneByOrFail({ id: reservation.eventId }),
    ).resolves.toMatchObject({ status: EventStatus.Published, cancelledByUserId: null });
    await expect(
      reservationsRepository.findOneByOrFail({ id: reservation.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      ticketsRepository.findOneByOrFail({ reservationItemId: item.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId }),
    ).resolves.toMatchObject({ soldAt: expect.any(Date) });
    await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
  });

  it.each([PaymentStatus.Pending, PaymentStatus.Approved])(
    'recusa o cancelamento de evento iniciado enquanto aguarda um Payment %s',
    async (paymentStatus) => {
      const [customerCookie, organizerCookie] = await Promise.all([
        authenticate(),
        authenticate(organizer),
      ]);
      const isApproved = paymentStatus === PaymentStatus.Approved;
      const reservation = isApproved
        ? await createConfirmedReservation(customerCookie)
        : await createActiveReservation();
      if (!isApproved) {
        await paymentsService.createSimulatedPixPayment(customer.id, reservation.id, randomUUID());
      }
      const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
      const cancellation = request(app.getHttpServer())
        .post(`/organizer/me/events/${reservation.eventId}/cancel`)
        .set('Origin', checkoutOrigin)
        .set('Cookie', organizerCookie);
      const response = await requestWaitingPastDeadline(
        cancellation,
        (manager) =>
          manager.getRepository(Payment).findOneOrFail({
            where: { id: payment.id },
            lock: { mode: 'pessimistic_write' },
          }),
        (_manager, startsAt) => eventsRepository.update(reservation.eventId, { startsAt }),
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EVENT_CANNOT_BE_CANCELLED');

      const item = await reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      await expect(
        eventsRepository.findOneByOrFail({ id: reservation.eventId }),
      ).resolves.toMatchObject({ status: EventStatus.Published, cancelledByUserId: null });
      await expect(
        reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({ cancelledAt: null });
      await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject({
        status: paymentStatus,
      });
      await expect(
        eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId }),
      ).resolves.toMatchObject({
        holdReservationId: isApproved ? null : reservation.id,
        soldAt: isApproved ? expect.any(Date) : null,
      });
      await expect(ticketsRepository.findBy({ reservationItemId: item.id })).resolves.toEqual(
        isApproved ? [expect.objectContaining({ cancelledAt: null })] : [],
      );
      await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
    },
    10_000,
  );

  it.each([
    { target: 'reserva', lock: 'assento', limit: 'hold' },
    { target: 'reserva', lock: 'ingresso', limit: 'início do evento' },
    { target: 'reserva', lock: 'assento', limit: 'janela de sete dias' },
    { target: 'reserva', lock: 'estorno', limit: 'janela de sete dias' },
    { target: 'evento', lock: 'ingresso', limit: 'início do evento' },
    { target: 'evento', lock: 'assento', limit: 'início do evento' },
    { target: 'evento', lock: 'estorno', limit: 'início do evento' },
  ] as const)(
    'reverte espera tardia de $lock no cancelamento de $target ao ultrapassar $limit',
    async ({ target, lock, limit }) => {
      const customerCookie = await authenticate();
      const isHold = limit === 'hold';
      const isEvent = target === 'evento';
      const reservation = isHold
        ? await createActiveReservation()
        : await createConfirmedReservation(customerCookie);
      const item = await reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const seat = await eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId });
      const payment = await paymentsRepository.findOneBy({ reservationId: reservation.id });
      const cancellation = request(app.getHttpServer())
        .post(
          isEvent
            ? `/organizer/me/events/${reservation.eventId}/cancel`
            : `/reservations/${reservation.id}/cancel`,
        )
        .set('Origin', checkoutOrigin)
        .set('Cookie', isEvent ? await authenticate(organizer) : customerCookie);

      const response = await requestWaitingPastDeadline(
        cancellation,
        (manager) => {
          switch (lock) {
            case 'ingresso':
              return manager.getRepository(Ticket).findOneOrFail({
                where: { reservationItemId: item.id },
                lock: { mode: 'pessimistic_write' },
              });
            case 'assento':
              return manager.getRepository(EventSeat).findOneOrFail({
                where: { id: seat.id },
                lock: { mode: 'pessimistic_write' },
              });
            case 'estorno':
              return manager.query('LOCK TABLE "refunds" IN SHARE MODE');
          }
        },
        async (manager, deadline) => {
          switch (limit) {
            case 'hold':
              await reservationsRepository.update(reservation.id, { expiresAt: deadline });
              await manager.getRepository(EventSeat).update(seat.id, { holdExpiresAt: deadline });
              break;
            case 'janela de sete dias':
              if (!payment) throw new Error('A compra do cenário precisa ter Payment');
              await paymentsRepository.update(payment.id, {
                approvedAt: new Date(deadline.getTime() - sevenDaysInMilliseconds),
              });
              break;
            case 'início do evento':
              await eventsRepository.update(reservation.eventId, { startsAt: deadline });
              break;
          }
        },
      );

      expect(response.status).toBe(409);
      const errorCode = isEvent
        ? 'EVENT_CANNOT_BE_CANCELLED'
        : isHold
          ? 'RESERVATION_NOT_ACTIVE'
          : 'CANCELLATION_NOT_ALLOWED';
      expect(response.body.code).toBe(errorCode);
      await expect(
        eventsRepository.findOneByOrFail({ id: reservation.eventId }),
      ).resolves.toMatchObject({ status: EventStatus.Published, cancelledByUserId: null });
      await expect(
        reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({ cancelledAt: null });
      await expect(eventSeatsRepository.findOneByOrFail({ id: seat.id })).resolves.toMatchObject({
        holdReservationId: seat.holdReservationId,
        soldAt: seat.soldAt,
      });
      await expect(ticketsRepository.findBy({ reservationItemId: item.id })).resolves.toEqual(
        isHold ? [] : [expect.objectContaining({ cancelledAt: null })],
      );
      if (payment) {
        await expect(paymentsRepository.findOneByOrFail({ id: payment.id })).resolves.toMatchObject(
          {
            status: PaymentStatus.Approved,
          },
        );
        await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
      }
      expect(seatRealtimeGateway.emitReleased).not.toHaveBeenCalled();
    },
    10_000,
  );

  it('serializa cancelamentos concorrentes do CUSTOMER sem duplicar Refund', async () => {
    const customerCookie = await authenticate();
    const reservation = await createConfirmedReservation(customerCookie);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Origin', checkoutOrigin)
        .set('Cookie', customerCookie),
      request(app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Origin', checkoutOrigin)
        .set('Cookie', customerCookie),
    ]);
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(1);
    expect(tickets).not.toHaveLength(0);
    expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
  });

  it('serializa cancelamento do CUSTOMER com cancelamento do Event sem deadlock', async () => {
    const customerCookie = await authenticate();
    const customerTwoCookie = await authenticate(customerTwo);
    const organizerCookie = await authenticate(organizer);
    const reservation = await createConfirmedReservation(customerCookie);
    const event = await eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const secondReservation = await createActiveReservation(undefined, 1, {
      event,
      customer: customerTwo,
      seatOffset: 1,
    });
    await createPaymentRequest(secondReservation.id, randomUUID(), customerTwoCookie).expect(201);

    const [customerResponse, organizerResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Origin', checkoutOrigin)
        .set('Cookie', customerCookie),
      request(app.getHttpServer())
        .post(`/organizer/me/events/${reservation.eventId}/cancel`)
        .set('Origin', checkoutOrigin)
        .set('Cookie', organizerCookie),
    ]);
    const persistedEvent = await eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const persistedSecondReservation = await reservationsRepository.findOneByOrFail({
      id: secondReservation.id,
    });
    const items = await reservationItemsRepository.findBy({
      reservationId: In([reservation.id, secondReservation.id]),
    });
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const payments = await paymentsRepository.findBy({
      reservationId: In([reservation.id, secondReservation.id]),
    });

    expect(organizerResponse.status).toBe(200);
    expect([200, 409]).toContain(customerResponse.status);
    expect(customerResponse.status).not.toBe(500);
    expect(persistedEvent.status).toBe(EventStatus.Cancelled);
    expect(persistedReservation.cancelledAt).not.toBeNull();
    expect(persistedSecondReservation.cancelledAt).not.toBeNull();
    expect(payments).toHaveLength(2);
    expect(payments.every(({ status }) => status === PaymentStatus.Approved)).toBe(true);
    await expect(
      refundsRepository.countBy({ paymentId: In(payments.map(({ id }) => id)) }),
    ).resolves.toBe(2);
    expect(tickets).toHaveLength(2);
    expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
  });

  it('serializa finalização de Payment com cancelamento do Event', async () => {
    const customerCookie = await authenticate();
    const organizerCookie = await authenticate(organizer);
    const reservation = await createActiveReservation();
    let resolveGateway!: (result: CardPaymentGatewayResult) => void;
    let notifyGatewayStarted!: () => void;
    const gatewayStarted = new Promise<void>((resolve) => {
      notifyGatewayStarted = resolve;
    });
    const gatewayResult = new Promise<CardPaymentGatewayResult>((resolve) => {
      resolveGateway = resolve;
    });
    paymentGateway.processCard.mockImplementationOnce(async () => {
      notifyGatewayStarted();
      return gatewayResult;
    });

    const paymentResponsePromise = createPaymentRequest(
      reservation.id,
      randomUUID(),
      customerCookie,
    ).then((response) => response);
    await gatewayStarted;
    const organizerResponsePromise = request(app.getHttpServer())
      .post(`/organizer/me/events/${reservation.eventId}/cancel`)
      .set('Origin', checkoutOrigin)
      .set('Cookie', organizerCookie)
      .then((response) => response);
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    const [paymentResponse, organizerResponse] = await Promise.all([
      paymentResponsePromise,
      organizerResponsePromise,
    ]);
    const persistedEvent = await eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });

    expect(organizerResponse.status).toBe(200);
    expect(paymentResponse.status).toBe(201);
    expect([PaymentStatus.Approved, PaymentStatus.Failed]).toContain(paymentResponse.body.status);
    expect(persistedEvent.status).toBe(EventStatus.Cancelled);
    expect(persistedReservation.cancelledAt).not.toBeNull();
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const refundCount = await refundsRepository.countBy({ paymentId: payment.id });

    if (payment.status === PaymentStatus.Approved) {
      expect(persistedReservation.confirmedAt).not.toBeNull();
      expect(tickets).not.toHaveLength(0);
      expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
      expect(refundCount).toBe(1);
    } else {
      expect(payment.status).toBe(PaymentStatus.Failed);
      expect(persistedReservation.confirmedAt).toBeNull();
      expect(tickets).toHaveLength(0);
      expect(refundCount).toBe(0);
    }
  });
});
