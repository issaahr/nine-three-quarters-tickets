import { Logger } from '@nestjs/common';

import { CatalogSource } from '../../modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../../modules/events/admissionMode.enum';
import { Event } from '../../modules/events/event.entity';
import { EventCategory } from '../../modules/events/eventCategory.enum';
import { EventSeat } from '../../modules/events/eventSeat.entity';
import { EventStatus } from '../../modules/events/eventStatus.enum';
import { User } from '../../modules/users/user.entity';
import { VenueSeat } from '../../modules/venues/venueSeat.entity';
import AppDataSource from '../dataSource';

const logger = new Logger('EventsSeed');

const ORGANIZER_EMAIL = 'organizer.demo@ntq.local';

const SEATED_VENUE_ID = '93400000-0000-4000-8000-000000000001';
const GENERAL_ADMISSION_VENUE_ID = '93400000-0000-4000-8000-000000000002';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Seed bloqueado em produção.');
    return;
  }

  await AppDataSource.initialize();

  try {
    const userRepository = AppDataSource.getRepository(User);
    const eventRepository = AppDataSource.getRepository(Event);

    const organizer = await userRepository.findOne({
      where: {
        email: ORGANIZER_EMAIL,
      },
    });

    if (!organizer) {
      throw new Error(`Usuário organizador não encontrado: ${ORGANIZER_EMAIL}`);
    }

    const events = [
      {
        title: 'Homem-Aranha: Um Novo Dia',
        description:
          'É um novo dia para Peter Parker. Combatendo o crime em tempo integral como Homem-Aranha em um mundo que não se lembra mais dele e lidando com a pressão de ver seus antigos amigos seguirem em frente sem sua presença, Peter passa por uma mudança que talvez nem ele tenha o poder de controlar. Mas essa transformação também pode ser a única coisa capaz de deter uma surpreendente nova ameaça à cidade e às pessoas que ele ama: um poderoso vilão que ninguém sequer consegue enxergar.',
        imageUrl: 'https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg',
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Published,
        startsAt: new Date('2026-08-28T03:38:00.000Z'),
        priceCents: 3000,
        capacity: null,
        venueId: SEATED_VENUE_ID,
        catalogSource: CatalogSource.Tmdb,
        externalId: '969681',
        genres: ['Ficção científica', 'Ação', 'Aventura'],
        cancelledByUserId: null,
      },
      {
        title: 'Moana',
        description:
          "Na Polinésia Antiga, quando uma terrível maldição contraída por Maui chega à ilha de um impetuoso chefe, sua filha obstinada responde ao chamado do Oceano para procurar o semideus e consertar as coisas. Adaptação live-action do filme de animação da Disney de 2016 'Moana'",
        imageUrl: 'https://image.tmdb.org/t/p/w500/eEsiTi19EYBluPQliS3CMnBgqTj.jpg',
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Published,
        startsAt: new Date('2026-08-27T22:27:00.000Z'),
        priceCents: 3000,
        capacity: null,
        venueId: SEATED_VENUE_ID,
        catalogSource: CatalogSource.Tmdb,
        externalId: '1108427',
        genres: ['Família', 'Fantasia', 'Comédia', 'Aventura'],
        cancelledByUserId: null,
      },
      {
        title: 'Eagles',
        description: null,
        imageUrl: 'https://s1.ticketm.net/dam/a/531/e32ef1da-b869-442c-9357-428baa6f0531_SOURCE',
        category: EventCategory.Show,
        admissionMode: AdmissionMode.GeneralAdmission,
        status: EventStatus.Published,
        startsAt: new Date('2026-08-28T02:46:00.000Z'),
        priceCents: 0,
        capacity: 998,
        venueId: GENERAL_ADMISSION_VENUE_ID,
        catalogSource: CatalogSource.Ticketmaster,
        externalId: 'K8vZ9171ob7',
        genres: ['Música', 'Rock', 'Pop'],
        cancelledByUserId: null,
      },
      {
        title: 'Obsessão',
        description:
          'Sem grandes pretensões, um romântico incurável compra um brinquedo que promete realizar desejos únicos. Ele quebra o artefato misterioso enquanto pede para conquistar a crush e consegue exatamente o que desejava, mas descobre que a consequência é sinistra.',
        imageUrl: 'https://image.tmdb.org/t/p/w500/wUc6IDf5ChjM1UyQye21qFBeJY0.jpg',
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Cancelled,
        startsAt: new Date('2026-09-03T04:02:00.000Z'),
        priceCents: 2000,
        capacity: null,
        venueId: SEATED_VENUE_ID,
        catalogSource: CatalogSource.Tmdb,
        externalId: '1339713',
        genres: ['Terror', 'Thriller'],
        cancelledByUserId: organizer.id,
      },
      {
        title: 'Palavra Cantada',
        description: null,
        imageUrl:
          'https://s1.ticketm.net/dam/c/1e5/abd7fc37-5fce-4756-ba3e-52fc9c4021e5_106221_TABLET_LANDSCAPE_LARGE_16_9.jpg',
        category: EventCategory.Show,
        admissionMode: AdmissionMode.GeneralAdmission,
        status: EventStatus.Cancelled,
        startsAt: new Date('2027-01-02T15:11:00.000Z'),
        priceCents: 3000,
        capacity: 200,
        venueId: GENERAL_ADMISSION_VENUE_ID,
        catalogSource: CatalogSource.Ticketmaster,
        externalId: 'K8vZ917rpqV',
        genres: ['Music', "Children's Music"],
        cancelledByUserId: organizer.id,
      },
      {
        title: 'BTS',
        description: null,
        imageUrl: 'https://s1.ticketm.net/dam/a/cac/79200b54-8f97-4909-a952-46af7db06cac_SOURCE',
        category: EventCategory.Show,
        admissionMode: AdmissionMode.GeneralAdmission,
        status: EventStatus.Published,
        startsAt: new Date('2026-09-12T23:24:00.000Z'),
        priceCents: 3000,
        capacity: 200,
        venueId: GENERAL_ADMISSION_VENUE_ID,
        catalogSource: CatalogSource.Ticketmaster,
        externalId: 'K8vZ917KpXV',
        genres: ['Música', 'Pop', 'K-Pop'],
        cancelledByUserId: null,
      },
      {
        title: 'New Order',
        description: null,
        imageUrl: 'https://s1.ticketm.net/dam/a/a6b/182bb789-0627-430d-8cc2-95a3c3224a6b_SOURCE',
        category: EventCategory.Show,
        admissionMode: AdmissionMode.GeneralAdmission,
        status: EventStatus.Published,
        startsAt: new Date('2026-08-26T04:35:00.000Z'),
        priceCents: 800,
        capacity: 211,
        venueId: GENERAL_ADMISSION_VENUE_ID,
        catalogSource: CatalogSource.Ticketmaster,
        externalId: 'K8vZ91712r7',
        genres: ['Música', 'Rock', 'Rock Alternativo'],
        cancelledByUserId: null,
      },
    ];

    const eventSeatRepository = AppDataSource.getRepository(EventSeat);
    const venueSeatRepository = AppDataSource.getRepository(VenueSeat);

    for (const event of events) {
      const existingEvent = await eventRepository.findOne({
        where: {
          catalogSource: event.catalogSource,
          externalId: event.externalId,
        },
      });

      if (existingEvent) {
        logger.debug(`Evento já existente: ${event.title}`);
        continue;
      }

      const createdEvent = await eventRepository.save(
        eventRepository.create({
          ...event,
          organizerId: organizer.id,
        }),
      );

      if (event.admissionMode === AdmissionMode.Seated) {
        const venueSeats = await venueSeatRepository.find({
          where: { venueId: event.venueId },
          order: { y: 'ASC', x: 'ASC' },
        });

        if (venueSeats.length === 0) {
          logger.warn(
            `Venue ${event.venueId} não possui assentos cadastrados; ${event.title} ficará sem EventSeats.`,
          );
        } else {
          await eventSeatRepository.insert(
            venueSeats.map((venueSeat) => ({
              eventId: createdEvent.id,
              venueSeatId: venueSeat.id,
              holdReservationId: null,
              holdExpiresAt: null,
              soldAt: null,
            })),
          );
        }
      }

      logger.log(`Evento criado: ${event.title}`);
    }

    logger.log('Seed de eventos concluído.');
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((error) => {
  logger.error('Erro ao executar seed.', error);
  process.exit(1);
});
