import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getOptionsToken, seconds } from '@nestjs/throttler';
import request, { type Response as HttpResponse, type Test as HttpRequest } from 'supertest';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { applicationConfig } from '../../src/config/applicationConfig';
import { Application } from '../../src/application';
import { CatalogSource } from '../../src/modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../../src/modules/events/admissionMode.enum';
import { Event } from '../../src/modules/events/event.entity';
import { EventCategory } from '../../src/modules/events/eventCategory.enum';
import { EventSeat } from '../../src/modules/events/eventSeat.entity';
import { EventStatus } from '../../src/modules/events/eventStatus.enum';
import { HostedPaymentGateway } from '../../src/modules/payments/hostedPaymentGateway.interfaces';
import { HostedPaymentOutcomeStatus } from '../../src/modules/payments/hostedPaymentOutcomeStatus.enum';
import { HostedPaymentReconciliationService } from '../../src/modules/payments/hostedPaymentReconciliation.service';
import { Payment } from '../../src/modules/payments/payment.entity';
import { PaymentCurrency } from '../../src/modules/payments/paymentCurrency.enum';
import { PaymentMethod } from '../../src/modules/payments/paymentMethod.enum';
import { PaymentProvider } from '../../src/modules/payments/paymentProvider.enum';
import {
  hostedPaymentGatewayToken,
  paymentGatewayToken,
  stripeCheckoutWebhookToken,
} from '../../src/modules/payments/payments.constants';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import {
  CardPaymentGatewayRequest,
  CardPaymentGatewayResult,
  CardPaymentGatewayStatus,
  PaymentGateway,
} from '../../src/modules/payments/paymentGateway.interfaces';
import { PaymentStatus } from '../../src/modules/payments/paymentStatus.enum';
import {
  StripeCheckoutEventType,
  StripeCheckoutObject,
} from '../../src/modules/payments/stripe/stripeCheckout.enums';
import { StripeCheckoutWebhook } from '../../src/modules/payments/stripe/stripeCheckoutWebhook';
import { StripeHostedPaymentGateway } from '../../src/modules/payments/stripe/stripeHostedPaymentGateway';
import { SeatRealtimeGateway } from '../../src/modules/realtime/seatRealtime.gateway';
import { HostedRefundReconciliationService } from '../../src/modules/refunds/hostedRefundReconciliation.service';
import { Refund } from '../../src/modules/refunds/refund.entity';
import { ReservationItem } from '../../src/modules/reservations/reservationItem.entity';
import { Reservation } from '../../src/modules/reservations/reservation.entity';
import { Ticket } from '../../src/modules/tickets/ticket.entity';
import { TicketCredentialService } from '../../src/modules/tickets/ticketCredential.service';
import { User } from '../../src/modules/users/user.entity';
import { Venue } from '../../src/modules/venues/venue.entity';
import { VenueSeat } from '../../src/modules/venues/venueSeat.entity';
import { RateLimitPolicy } from '../../src/rateLimit/rateLimitPolicy.enum';
import {
  generateRateLimitKey,
  trackHostedCheckoutRequest,
} from '../../src/rateLimit/rateLimit.trackers';

class ControlledPaymentGateway implements PaymentGateway {
  public processCard = jest.fn(
    async (request: CardPaymentGatewayRequest): Promise<CardPaymentGatewayResult> => {
      void request;
      return { status: CardPaymentGatewayStatus.Approved };
    },
  );
}

/**
 * Contexto isolado por suíte de pagamentos, com PostgreSQL real e respostas controladas dos gateways.
 * O construtor registra o setup, a restauração dos mocks e a limpeza apenas dos eventos desta suíte.
 */
export class PaymentsTestContext {
  public readonly checkoutOrigin = applicationConfig.corsOrigins[0];
  public readonly sevenDaysInMilliseconds = 7 * 24 * 60 * 60 * 1000;
  private readonly lockPollAttempts = 100;
  private readonly lockPollIntervalMilliseconds = 20;
  private readonly deadlineAfterLockObservedMilliseconds = 50;
  private readonly deadlineBeforeRequestMilliseconds = 2_000;
  public readonly webhookFixtureSecret = 'whsec_payment_test_fixture';
  private readonly webhookEndpoint = '/payments/webhooks/stripe';
  public app!: INestApplication;
  public dataSource!: DataSource;
  public eventsRepository!: Repository<Event>;
  public eventSeatsRepository!: Repository<EventSeat>;
  public paymentsRepository!: Repository<Payment>;
  public reservationItemsRepository!: Repository<ReservationItem>;
  public reservationsRepository!: Repository<Reservation>;
  public refundsRepository!: Repository<Refund>;
  public ticketsRepository!: Repository<Ticket>;
  public ticketCredentialService!: TicketCredentialService;
  private venueSeatsRepository!: Repository<VenueSeat>;
  public customer!: User;
  public customerTwo!: User;
  public organizer!: User;
  private venue!: Venue;
  public paymentGateway!: ControlledPaymentGateway;
  private readonly stripeAmountPolicy = new StripeHostedPaymentGateway(
    'sk_test_amount_policy_fixture',
  );
  public readonly hostedGateway: jest.Mocked<HostedPaymentGateway> = {
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
  public paymentsService!: PaymentsService;
  public reconciliation!: HostedPaymentReconciliationService;
  public refundReconciliation!: HostedRefundReconciliationService;
  public seatRealtimeGateway!: SeatRealtimeGateway;
  public readonly createdEventIds: string[] = [];
  public constructor() {
    beforeAll(async () => {
      this.paymentGateway = new ControlledPaymentGateway();
      this.app = await this.createPaymentsTestApplication();

      this.dataSource = this.app.get(DataSource);
      this.paymentsService = this.app.get(PaymentsService);
      this.reconciliation = this.app.get(HostedPaymentReconciliationService);
      this.refundReconciliation = this.app.get(HostedRefundReconciliationService);
      this.eventsRepository = this.dataSource.getRepository(Event);
      this.eventSeatsRepository = this.dataSource.getRepository(EventSeat);
      this.paymentsRepository = this.dataSource.getRepository(Payment);
      this.reservationItemsRepository = this.dataSource.getRepository(ReservationItem);
      this.reservationsRepository = this.dataSource.getRepository(Reservation);
      this.refundsRepository = this.dataSource.getRepository(Refund);
      this.ticketsRepository = this.dataSource.getRepository(Ticket);
      this.ticketCredentialService = this.app.get(TicketCredentialService);
      this.seatRealtimeGateway = this.app.get(SeatRealtimeGateway);
      jest.spyOn(this.seatRealtimeGateway, 'emitSold').mockImplementation();
      jest.spyOn(this.seatRealtimeGateway, 'emitReleased').mockImplementation();
      this.venueSeatsRepository = this.dataSource.getRepository(VenueSeat);
      this.customer = await this.dataSource
        .getRepository(User)
        .findOneByOrFail({ email: 'customer.one.demo@ntq.local' });
      this.customerTwo = await this.dataSource
        .getRepository(User)
        .findOneByOrFail({ email: 'customer.two.demo@ntq.local' });
      this.organizer = await this.dataSource
        .getRepository(User)
        .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
      this.venue = await this.dataSource
        .getRepository(Venue)
        .findOneByOrFail({ name: 'Cine Imperial · Sala A' });
    });
    beforeEach(() => {
      this.paymentGateway.processCard.mockReset();
      this.paymentGateway.processCard.mockResolvedValue({
        status: CardPaymentGatewayStatus.Approved,
      });
      this.hostedGateway.createCheckout.mockReset();
      this.hostedGateway.assertCheckoutAmount.mockReset();
      this.hostedGateway.assertCheckoutAmount.mockImplementation(
        this.stripeAmountPolicy.assertCheckoutAmount.bind(this.stripeAmountPolicy),
      );
      this.hostedGateway.findCheckout.mockReset().mockResolvedValue(null);
      this.hostedGateway.retrieveCheckout.mockReset();
      this.hostedGateway.retrievePaymentOutcome.mockReset();
      this.hostedGateway.expireCheckout.mockReset();
      this.hostedGateway.createRefund.mockReset();
      this.hostedGateway.findRefund.mockReset();
      this.hostedGateway.retrieveRefund.mockReset();
      jest.mocked(this.seatRealtimeGateway.emitSold).mockClear();
      jest.mocked(this.seatRealtimeGateway.emitReleased).mockClear();
    });
    afterAll(async () => {
      if (this.createdEventIds.length > 0) {
        const reservations = await this.reservationsRepository.find({
          select: { id: true },
          where: { eventId: In(this.createdEventIds) },
        });
        const reservationIds = reservations.map(({ id }) => id);

        if (reservationIds.length > 0) {
          const items = await this.reservationItemsRepository.find({
            select: { id: true },
            where: { reservationId: In(reservationIds) },
          });
          const itemIds = items.map(({ id }) => id);

          if (itemIds.length > 0) {
            await this.ticketsRepository.delete({ reservationItemId: In(itemIds) });
          }
          const payments = await this.paymentsRepository.find({
            select: { id: true },
            where: { reservationId: In(reservationIds) },
          });
          const paymentIds = payments.map(({ id }) => id);
          if (paymentIds.length > 0) {
            await this.refundsRepository.delete({ paymentId: In(paymentIds) });
          }
          await this.paymentsRepository.delete({ reservationId: In(reservationIds) });
          await this.reservationItemsRepository.delete({ reservationId: In(reservationIds) });
        }
        await this.eventSeatsRepository.delete({ eventId: In(this.createdEventIds) });
        await this.reservationsRepository.delete({ eventId: In(this.createdEventIds) });
        await this.eventsRepository.delete({ id: In(this.createdEventIds) });
      }
      await this.app.close();
    });
  }
  public async createPaymentsTestApplication(
    hostedCheckoutLimit?: number,
  ): Promise<INestApplication> {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(paymentGatewayToken)
      .useValue(this.paymentGateway)
      .overrideProvider(hostedPaymentGatewayToken)
      .useValue(this.hostedGateway)
      .overrideProvider(stripeCheckoutWebhookToken)
      .useValue(new StripeCheckoutWebhook(this.webhookFixtureSecret));
    if (hostedCheckoutLimit !== undefined) {
      testingModule.overrideProvider(getOptionsToken()).useValue([
        {
          name: RateLimitPolicy.HostedCheckout,
          ttl: seconds(60),
          limit: hostedCheckoutLimit,
          getTracker: trackHostedCheckoutRequest,
          generateKey: generateRateLimitKey,
        },
      ]);
    }

    const testApp = (await testingModule.compile()).createNestApplication({ rawBody: true });
    new Application().configure(testApp);
    await testApp.init();
    return testApp;
  }

  public async authenticate(user: User = this.customer): Promise<string> {
    const response = await request(this.app.getHttpServer()).post('/auth/login').send({
      email: user.email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  public async createActiveReservation(
    expiresAt: Date = new Date('2099-09-01T23:30:00.000Z'),
    itemCount: number = 1,
    parameters: { event?: Event; customer?: User; seatOffset?: number } = {},
  ): Promise<Reservation> {
    const event =
      parameters.event ??
      (await this.eventsRepository.save({
        organizerId: this.organizer.id,
        venueId: this.venue.id,
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
      this.createdEventIds.push(event.id);
    }
    const venueSeats = await this.venueSeatsRepository.find({
      where: { venueId: this.venue.id },
      order: { row: 'ASC', number: 'ASC' },
      skip: parameters.seatOffset ?? 0,
      take: itemCount,
    });

    if (venueSeats.length !== itemCount) {
      throw new Error('Venue de demonstração não possui assentos suficientes para o teste');
    }

    const reservation =
      expiresAt.getTime() > Date.now()
        ? await this.reservationsRepository.save({
            customerId: parameters.customer?.id ?? this.customer.id,
            eventId: event.id,
            expiresAt,
            confirmedAt: null,
            cancelledAt: null,
          })
        : await this.createExpiredReservation(
            parameters.customer?.id ?? this.customer.id,
            event.id,
            expiresAt,
          );
    const eventSeats = await this.eventSeatsRepository.save(
      venueSeats.map((venueSeat) =>
        this.eventSeatsRepository.create({
          eventId: event.id,
          venueSeatId: venueSeat.id,
          holdReservationId: reservation.id,
          holdExpiresAt: expiresAt,
          soldAt: null,
        }),
      ),
    );
    await this.reservationItemsRepository.save(
      eventSeats.map((eventSeat) =>
        this.reservationItemsRepository.create({
          reservationId: reservation.id,
          eventSeatId: eventSeat.id,
          unitPriceCents: 2590,
        }),
      ),
    );

    return reservation;
  }

  private async createExpiredReservation(
    customerId: string,
    eventId: string,
    expiresAt: Date,
  ): Promise<Reservation> {
    const createdAt = new Date(expiresAt.getTime() - 60 * 1000);
    const rows = (await this.dataSource.query(
      `
        INSERT INTO "reservations" (
          "customerId", "eventId", "createdAt", "updatedAt", "expiresAt", "confirmedAt", "cancelledAt"
        ) VALUES ($1, $2, $3, $3, $4, NULL, NULL)
        RETURNING "id"
      `,
      [customerId, eventId, createdAt, expiresAt],
    )) as Array<{ id: string }>;

    return this.reservationsRepository.findOneByOrFail({ id: rows[0].id });
  }

  public createPaymentRequest(
    reservationId: string,
    idempotencyKey: string,
    cookie: string,
  ): HttpRequest {
    return request(this.app.getHttpServer())
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

  public createPixRequest(
    reservationId: string,
    cookie: string,
    idempotencyKey: string = randomUUID(),
    application: INestApplication = this.app,
  ): HttpRequest {
    return request(application.getHttpServer())
      .post(`/reservations/${reservationId}/payments/pix`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey);
  }

  public settlePixRequest(reservationId: string, paymentId: string, cookie: string): HttpRequest {
    return request(this.app.getHttpServer())
      .post(`/reservations/${reservationId}/payments/pix/${paymentId}/settle`)
      .set('Cookie', cookie);
  }

  public startHostedRequest(
    reservationId: string,
    cookie: string,
    idempotencyKey: string = randomUUID(),
    instance: INestApplication = this.app,
  ): HttpRequest {
    return request(instance.getHttpServer())
      .post(`/reservations/${reservationId}/payments/hosted`)
      .set('Cookie', cookie)
      .set('Origin', this.checkoutOrigin)
      .set('Idempotency-Key', idempotencyKey);
  }

  public async createPendingHostedPayment(
    reservation: Reservation,
    externalReference: string | null,
    method: PaymentMethod = PaymentMethod.Card,
  ): Promise<Payment> {
    const items = await this.reservationItemsRepository.findBy({ reservationId: reservation.id });
    return this.paymentsRepository.save({
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

  public sendHostedNotification(
    paymentId: string,
    externalReference: string,
    options: { validSignature?: boolean; livemode?: boolean; type?: StripeCheckoutEventType } = {},
    instance: INestApplication = this.app,
  ): HttpRequest {
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
    const signature = createHmac('sha256', this.webhookFixtureSecret)
      .update(`${timestamp}.${payload}${options.validSignature === false ? ' ' : ''}`)
      .digest('hex');
    return request(instance.getHttpServer())
      .post(this.webhookEndpoint)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', `t=${timestamp},v1=${signature}`)
      .send(payload);
  }

  public reportHostedPaymentAsPaid(paymentId: string, externalPaymentReference: string): void {
    this.hostedGateway.retrievePaymentOutcome.mockImplementation(async (attempt) =>
      attempt.paymentId === paymentId
        ? { status: HostedPaymentOutcomeStatus.Paid, externalPaymentReference }
        : { status: HostedPaymentOutcomeStatus.Pending, canExpire: false },
    );
  }

  /**
   * Aguarda evidência de bloqueio no PostgreSQL antes de continuar o cenário concorrente.
   *
   * @param pid - PID da conexão que deve bloquear outra transação.
   */
  public async waitForBlockedTransaction(pid: number): Promise<void> {
    for (let attempt = 0; attempt < this.lockPollAttempts; attempt++) {
      const [{ blocked }] = (await this.dataSource.query(
        'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',
        [pid],
      )) as Array<{ blocked: boolean }>;
      if (blocked) return;
      await delay(this.lockPollIntervalMilliseconds);
    }

    throw new Error('Nenhuma transação aguardou o lock observado');
  }

  /**
   * Mantém um lock até o prazo definido pelo banco vencer, liberando então o cancelamento.
   *
   * @param cancellation - Requisição de cancelamento que deve aguardar o lock.
   * @param acquireLock - Operação que obtém o lock na conexão controlada pelo teste.
   * @param setDeadline - Escrita que coloca o prazo entre o início e a retomada da requisição.
   * @returns Resposta HTTP após a liberação do lock e a decisão transacional.
   */
  public async cancelAfterDeadline(
    cancellation: HttpRequest,
    acquireLock: (manager: EntityManager) => Promise<unknown>,
    setDeadline: (manager: EntityManager, deadline: Date) => Promise<unknown>,
  ): Promise<HttpResponse> {
    const locker = this.dataSource.createQueryRunner();
    await locker.connect();
    let response: Promise<HttpResponse> | undefined;

    try {
      await locker.startTransaction();
      await acquireLock(locker.manager);
      const [{ pid }] = (await locker.query('SELECT pg_backend_pid() AS pid')) as Array<{
        pid: number;
      }>;
      response = cancellation.then((result) => result);
      await this.waitForBlockedTransaction(pid);

      // Coloca o prazo entre o início da transação bloqueada e a liberação do lock.
      const [{ deadline }] = (await locker.query(
        `SELECT date_trunc('milliseconds', clock_timestamp()) + $1::int * interval '1 millisecond' AS deadline`,
        [this.deadlineAfterLockObservedMilliseconds],
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

  /**
   * Comprova que a operação começou antes do prazo e só prosseguiu após seu vencimento no banco.
   *
   * @param pendingRequest - Requisição que deve aguardar a escrita bloqueada.
   * @param acquireLock - Operação que obtém o lock na conexão controlada pelo teste.
   * @param setDeadline - Escrita dos timestamps autoritativos usados no cenário.
   * @returns Resposta HTTP após atravessar o prazo enquanto aguardava o lock.
   */
  public async requestWaitingPastDeadline(
    pendingRequest: HttpRequest,
    acquireLock: (manager: EntityManager) => Promise<unknown>,
    setDeadline: (manager: EntityManager, deadline: Date) => Promise<unknown>,
  ): Promise<HttpResponse> {
    const locker = this.dataSource.createQueryRunner();
    await locker.connect();
    let response: Promise<HttpResponse> | undefined;

    try {
      await locker.startTransaction();
      await acquireLock(locker.manager);
      const [{ pid, deadline }] = (await locker.query(
        `SELECT pg_backend_pid() AS pid,
                date_trunc('milliseconds', clock_timestamp()) + $1::int * interval '1 millisecond' AS deadline`,
        [this.deadlineBeforeRequestMilliseconds],
      )) as Array<{ pid: number; deadline: Date }>;
      await setDeadline(locker.manager, deadline);
      response = pendingRequest.then((result) => result);
      await this.waitForBlockedTransaction(pid);

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

  public async createConfirmedReservation(cookie: string): Promise<Reservation> {
    const reservation = await this.createActiveReservation();
    await this.createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);
    return this.reservationsRepository.findOneByOrFail({ id: reservation.id });
  }
}
