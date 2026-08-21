import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { catalogProviderToken } from '../catalog/catalog.constants';
import { CatalogProvider } from '../catalog/catalogProvider';
import { CatalogSource } from '../catalog/catalogSource.enum';
import { Venue } from '../venues/venue.entity';
import { VenueSeat } from '../venues/venueSeat.entity';
import { AdmissionMode } from './admissionMode.enum';
import { CreateMovieEventRequestDto } from './dto/createMovieEventRequest.dto';
import { Event } from './event.entity';
import { EventCategory } from './eventCategory.enum';
import { EventSeat } from './eventSeat.entity';
import { EventStatus } from './eventStatus.enum';
import { CatalogItemNotFoundError } from './errors/catalogItemNotFound.error';
import { EventCannotBePublishedError } from './errors/eventCannotBePublished.error';
import { EventMustStartInFutureError } from './errors/eventMustStartInFuture.error';
import { EventNotFoundError } from './errors/eventNotFound.error';
import { VenueHasNoSeatsError } from './errors/venueHasNoSeats.error';
import { VenueNotFoundError } from './errors/venueNotFound.error';
import { venueLocalDateTimeToDate } from './time/venueLocalDateTime';

@Injectable()
export class EventsService {
  public constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @Inject(catalogProviderToken)
    private readonly catalogProvider: CatalogProvider,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Cria um DRAFT usando somente identidade, conteúdo e horário derivados por fontes confiáveis.
   *
   * @param organizerId - Identidade do organizador obtida da sessão autenticada.
   * @param request - Entrada validada com referências e atributos locais permitidos.
   * @returns Event persistido com o snapshot atual do catálogo.
   */
  public async createMovie(
    organizerId: string,
    request: CreateMovieEventRequestDto,
  ): Promise<Event> {
    const venue = await this.venuesRepository.findOneBy({ id: request.venueId });

    if (!venue) {
      throw new VenueNotFoundError();
    }

    const startsAt = venueLocalDateTimeToDate(request.startsAtLocal, venue.timeZone);

    if (startsAt.getTime() <= Date.now()) {
      throw new EventMustStartInFutureError();
    }

    const catalogItem = await this.catalogProvider.findByExternalId(request.externalId);

    if (!catalogItem) {
      throw new CatalogItemNotFoundError();
    }

    return this.eventsRepository.save(
      this.eventsRepository.create({
        organizerId,
        venueId: venue.id,
        title: catalogItem.title,
        description: catalogItem.description ?? null,
        imageUrl: catalogItem.imageUrl ?? null,
        genres: catalogItem.genres,
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Draft,
        startsAt,
        priceCents: request.priceCents,
        capacity: null,
        catalogSource: CatalogSource.Tmdb,
        externalId: catalogItem.externalId,
      }),
    );
  }

  /**
   * Recupera as ocorrências do organizador com o Venue necessário para apresentação canônica.
   *
   * @param organizerId - Identidade obtida da sessão autenticada.
   * @returns Events do organizador, ordenados da ocorrência mais recente para a mais antiga.
   */
  public findByOrganizerId(organizerId: string): Promise<Event[]> {
    return this.eventsRepository.find({
      where: { organizerId },
      relations: { venue: true },
      order: { startsAt: 'DESC' },
    });
  }

  /**
   * Publica atomicamente um Event SEATED e fotografa o layout atual do Venue.
   * Repetir a operação sobre um Event já publicado não recria seu inventário.
   *
   * @param organizerId - Identidade obtida da sessão autenticada.
   * @param eventId - Event que deve pertencer ao organizador.
   * @returns Event publicado após a materialização integral dos assentos.
   */
  public publish(organizerId: string, eventId: string): Promise<Event> {
    return this.dataSource.transaction(async (manager) => {
      const eventsRepository = manager.getRepository(Event);
      const eventSeatsRepository = manager.getRepository(EventSeat);
      const venueSeatsRepository = manager.getRepository(VenueSeat);
      const event = await eventsRepository.findOne({
        where: { id: eventId, organizerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!event) {
        throw new EventNotFoundError();
      }

      if (event.status === EventStatus.Published) {
        return event;
      }

      if (event.status !== EventStatus.Draft || event.admissionMode !== AdmissionMode.Seated) {
        throw new EventCannotBePublishedError();
      }

      if (event.startsAt.getTime() <= Date.now()) {
        throw new EventMustStartInFutureError();
      }

      const venueSeats = await venueSeatsRepository.find({
        where: { venueId: event.venueId },
        order: { y: 'ASC', x: 'ASC' },
      });

      if (venueSeats.length === 0) {
        throw new VenueHasNoSeatsError();
      }

      await eventSeatsRepository.insert(
        venueSeats.map((venueSeat) => ({
          eventId: event.id,
          venueSeatId: venueSeat.id,
          holdReservationId: null,
          holdExpiresAt: null,
          soldAt: null,
        })),
      );

      event.status = EventStatus.Published;
      return eventsRepository.save(event);
    });
  }
}
