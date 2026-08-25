import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { CatalogSource } from '../src/modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../src/modules/events/admissionMode.enum';
import { Event } from '../src/modules/events/event.entity';
import { EventCategory } from '../src/modules/events/eventCategory.enum';
import { EventSeat } from '../src/modules/events/eventSeat.entity';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { ReservationItem } from '../src/modules/reservations/reservationItem.entity';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { Ticket } from '../src/modules/tickets/ticket.entity';
import { TicketCredentialService } from '../src/modules/tickets/ticketCredential.service';
import { TicketStatus } from '../src/modules/tickets/ticketStatus.enum';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';
import { VenueSeat } from '../src/modules/venues/venueSeat.entity';

describe('Tickets', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let eventsRepository: Repository<Event>;
  let eventSeatsRepository: Repository<EventSeat>;
  let reservationItemsRepository: Repository<ReservationItem>;
  let reservationsRepository: Repository<Reservation>;
  let ticketsRepository: Repository<Ticket>;
  let venueSeatsRepository: Repository<VenueSeat>;
  let ticketCredentialService: TicketCredentialService;
  let customerOne: User;
  let customerTwo: User;
  let gate: User;
  let organizer: User;
  let venue: Venue;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    eventSeatsRepository = dataSource.getRepository(EventSeat);
    reservationItemsRepository = dataSource.getRepository(ReservationItem);
    reservationsRepository = dataSource.getRepository(Reservation);
    ticketsRepository = dataSource.getRepository(Ticket);
    venueSeatsRepository = dataSource.getRepository(VenueSeat);
    ticketCredentialService = app.get(TicketCredentialService);
    customerOne = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.one.demo@ntq.local' });
    customerTwo = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.two.demo@ntq.local' });
    gate = await dataSource.getRepository(User).findOneByOrFail({ email: 'gate.demo@ntq.local' });
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    venue = await dataSource
      .getRepository(Venue)
      .findOneByOrFail({ name: 'Cine Imperial · Sala A' });
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
        await reservationItemsRepository.delete({ reservationId: In(reservationIds) });
      }

      await eventSeatsRepository.delete({ eventId: In(createdEventIds) });
      await reservationsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    await app.close();
  });

  async function authenticate(user: User): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email: user.email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  async function createConfirmedPurchase(
    customer: User,
    ticketCount: number,
  ): Promise<{
    reservation: Reservation;
    tickets: Ticket[];
  }> {
    const event = await eventsRepository.save(
      eventsRepository.create({
        organizerId: organizer.id,
        venueId: venue.id,
        title: 'Tickets compartilháveis',
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
      }),
    );
    createdEventIds.push(event.id);
    const venueSeats = await venueSeatsRepository.find({
      where: { venueId: venue.id },
      order: { row: 'ASC', number: 'ASC' },
      take: ticketCount,
    });

    if (venueSeats.length !== ticketCount) {
      throw new Error('Venue de demonstração não possui assentos suficientes para o teste');
    }

    const confirmedAt = new Date('2099-08-01T12:00:00.000Z');
    const reservation = await reservationsRepository.save(
      reservationsRepository.create({
        customerId: customer.id,
        eventId: event.id,
        expiresAt: new Date('2099-08-01T12:10:00.000Z'),
        confirmedAt,
        cancelledAt: null,
      }),
    );
    const eventSeats = await eventSeatsRepository.save(
      venueSeats.map((venueSeat) =>
        eventSeatsRepository.create({
          eventId: event.id,
          venueSeatId: venueSeat.id,
          holdReservationId: null,
          holdExpiresAt: null,
          soldAt: confirmedAt,
        }),
      ),
    );
    const items = await reservationItemsRepository.save(
      eventSeats.map((eventSeat) =>
        reservationItemsRepository.create({
          reservationId: reservation.id,
          eventSeatId: eventSeat.id,
          unitPriceCents: 2590,
        }),
      ),
    );
    const tickets = await ticketsRepository.save(
      items.map((item) =>
        ticketsRepository.create({
          reservationItemId: item.id,
          publicId: ticketCredentialService.createPublicId(),
          manualCode: ticketCredentialService.createManualCode(),
          issuedAt: confirmedAt,
          checkedInAt: null,
          cancelledAt: null,
        }),
      ),
    );

    return { reservation, tickets };
  }

  it('agrupa Tickets por compra e não expõe compras de outro CUSTOMER', async () => {
    const ownedPurchase = await createConfirmedPurchase(customerOne, 2);
    const otherPurchase = await createConfirmedPurchase(customerTwo, 1);
    const cookie = await authenticate(customerOne);

    const response = await request(app.getHttpServer())
      .get('/tickets')
      .set('Cookie', cookie)
      .expect(200);
    const ownedPurchaseResponse = await request(app.getHttpServer())
      .get(`/tickets?reservationId=${ownedPurchase.reservation.id}`)
      .set('Cookie', cookie)
      .expect(200);
    const filteredResponse = await request(app.getHttpServer())
      .get(`/tickets?reservationId=${otherPurchase.reservation.id}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reservationId: ownedPurchase.reservation.id }),
      ]),
    );
    expect(response.body.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reservationId: otherPurchase.reservation.id }),
      ]),
    );
    expect(ownedPurchaseResponse.body.items).toHaveLength(1);
    expect(ownedPurchaseResponse.body.items[0]).toMatchObject({
      reservationId: ownedPurchase.reservation.id,
      event: {
        title: 'Tickets compartilháveis',
        venueName: venue.name,
        venueTimeZone: venue.timeZone,
      },
    });
    expect(ownedPurchaseResponse.body.items[0].tickets).toHaveLength(2);
    expect(
      new Set(
        ownedPurchaseResponse.body.items[0].tickets.map(
          (ticket: { publicId: string }) => ticket.publicId,
        ),
      ).size,
    ).toBe(2);
    expect(ownedPurchaseResponse.body.items[0].tickets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: TicketStatus.Valid, seatLabel: expect.any(String) }),
      ]),
    );
    expect(filteredResponse.body.items).toEqual([]);
  });

  it('exige CUSTOMER para consultar Tickets próprios', async () => {
    const cookie = await authenticate(organizer);

    await request(app.getHttpServer()).get('/tickets').set('Cookie', cookie).expect(403);
  });

  it('apresenta o Ticket compartilhado com seu estado atual', async () => {
    const { tickets } = await createConfirmedPurchase(customerOne, 1);
    const ticket = tickets[0];
    const credential = ticketCredentialService.createCredential(ticket.publicId);

    const validResponse = await request(app.getHttpServer())
      .get(`/tickets/shared/${credential}`)
      .expect(200);
    await ticketsRepository.update(ticket.id, {
      checkedInAt: new Date('2099-08-01T12:30:00.000Z'),
    });
    const usedResponse = await request(app.getHttpServer())
      .get(`/tickets/shared/${credential}`)
      .expect(200);
    await ticketsRepository.update(ticket.id, {
      cancelledAt: new Date('2099-08-01T12:40:00.000Z'),
    });
    const cancelledResponse = await request(app.getHttpServer())
      .get(`/tickets/shared/${credential}`)
      .expect(200);

    expect(validResponse.body).toMatchObject({
      publicId: ticket.publicId,
      credential,
      manualCode: ticket.manualCode,
      status: TicketStatus.Valid,
      event: { title: 'Tickets compartilháveis' },
    });
    expect(usedResponse.body.status).toBe(TicketStatus.Used);
    expect(cancelledResponse.body.status).toBe(TicketStatus.Cancelled);
  });

  it('rejeita publicId isolado e assinatura adulterada sem revelar o Ticket', async () => {
    const { tickets } = await createConfirmedPurchase(customerOne, 1);
    const ticket = tickets[0];
    const credential = ticketCredentialService.createCredential(ticket.publicId);
    const invalidCredential = `${credential.slice(0, -1)}${credential.endsWith('a') ? 'b' : 'a'}`;

    await request(app.getHttpServer()).get(`/tickets/shared/${ticket.publicId}`).expect(404);
    await request(app.getHttpServer()).get(`/tickets/shared/${invalidCredential}`).expect(404);
  });

  it('retorna os resultados semânticos do check-in QR e registra o operador vencedor', async () => {
    const validPurchase = await createConfirmedPurchase(customerOne, 1);
    const validTicket = validPurchase.tickets[0];
    const mismatchPurchase = await createConfirmedPurchase(customerOne, 1);
    const mismatchTicket = mismatchPurchase.tickets[0];
    const cancelledPurchase = await createConfirmedPurchase(customerOne, 1);
    const cancelledTicket = cancelledPurchase.tickets[0];
    const cookie = await authenticate(gate);

    await ticketsRepository.update(cancelledTicket.id, { cancelledAt: new Date() });

    const invalidResponse = await request(app.getHttpServer())
      .post(`/gate/events/${validPurchase.reservation.eventId}/check-in`)
      .set('Cookie', cookie)
      .send({ credential: 'v1.invalid.signature' })
      .expect(200);
    const validResponse = await request(app.getHttpServer())
      .post(`/gate/events/${validPurchase.reservation.eventId}/check-in`)
      .set('Cookie', cookie)
      .send({ credential: ticketCredentialService.createCredential(validTicket.publicId) })
      .expect(200);
    const usedResponse = await request(app.getHttpServer())
      .post(`/gate/events/${validPurchase.reservation.eventId}/check-in`)
      .set('Cookie', cookie)
      .send({ credential: ticketCredentialService.createCredential(validTicket.publicId) })
      .expect(200);
    const mismatchResponse = await request(app.getHttpServer())
      .post(`/gate/events/${validPurchase.reservation.eventId}/check-in`)
      .set('Cookie', cookie)
      .send({ credential: ticketCredentialService.createCredential(mismatchTicket.publicId) })
      .expect(200);
    const cancelledResponse = await request(app.getHttpServer())
      .post(`/gate/events/${cancelledPurchase.reservation.eventId}/check-in`)
      .set('Cookie', cookie)
      .send({ credential: ticketCredentialService.createCredential(cancelledTicket.publicId) })
      .expect(200);
    const persistedTicket = await ticketsRepository.findOneByOrFail({ id: validTicket.id });

    expect(invalidResponse.body).toEqual({ result: 'INVALID' });
    expect(validResponse.body).toEqual({ result: 'VALID' });
    expect(usedResponse.body).toEqual({ result: 'ALREADY_USED' });
    expect(mismatchResponse.body).toEqual({ result: 'EVENT_MISMATCH' });
    expect(cancelledResponse.body).toEqual({ result: 'CANCELLED' });
    expect(persistedTicket.checkedInAt).toBeInstanceOf(Date);
    expect(persistedTicket.checkedInByUserId).toBe(gate.id);
  });

  it('aceita código manual normalizado e restringe ambos os endpoints ao GATE', async () => {
    const { reservation, tickets } = await createConfirmedPurchase(customerOne, 1);
    const ticket = tickets[0];
    const gateCookie = await authenticate(gate);
    const customerCookie = await authenticate(customerOne);

    const response = await request(app.getHttpServer())
      .post(`/gate/events/${reservation.eventId}/check-in/manual-code`)
      .set('Cookie', gateCookie)
      .send({ manualCode: ticket.manualCode.toLowerCase().replace('-', ' ') })
      .expect(200);

    expect(response.body).toEqual({ result: 'VALID' });

    await request(app.getHttpServer())
      .post(`/gate/events/${reservation.eventId}/check-in/manual-code`)
      .send({ manualCode: ticket.manualCode })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/gate/events/${reservation.eventId}/check-in`)
      .set('Cookie', customerCookie)
      .send({ credential: ticketCredentialService.createCredential(ticket.publicId) })
      .expect(403);
  });

  it('rejeita manualCode acima de 200 caracteres', async () => {
    const { reservation } = await createConfirmedPurchase(customerOne, 1);
    const cookie = await authenticate(gate);

    await request(app.getHttpServer())
      .post(`/gate/events/${reservation.eventId}/check-in/manual-code`)
      .set('Cookie', cookie)
      .send({ manualCode: 'a'.repeat(201) })
      .expect(400);
  });

  it('rejeita credential acima de 200 caracteres', async () => {
    const { reservation } = await createConfirmedPurchase(customerOne, 1);
    const cookie = await authenticate(gate);

    await request(app.getHttpServer())
      .post(`/gate/events/${reservation.eventId}/check-in`)
      .set('Cookie', cookie)
      .send({ credential: 'a'.repeat(201) })
      .expect(400);
  });

  it('aceita exatamente um check-in em duas tentativas concorrentes', async () => {
    const { reservation, tickets } = await createConfirmedPurchase(customerOne, 1);
    const ticket = tickets[0];
    const cookie = await authenticate(gate);
    const requestBody = { credential: ticketCredentialService.createCredential(ticket.publicId) };

    const [firstResponse, secondResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/gate/events/${reservation.eventId}/check-in`)
        .set('Cookie', cookie)
        .send(requestBody),
      request(app.getHttpServer())
        .post(`/gate/events/${reservation.eventId}/check-in`)
        .set('Cookie', cookie)
        .send(requestBody),
    ]);

    expect([firstResponse.status, secondResponse.status]).toEqual([200, 200]);
    expect([firstResponse.body.result, secondResponse.body.result].sort()).toEqual([
      'ALREADY_USED',
      'VALID',
    ]);
  });
});
