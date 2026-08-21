import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';

import { catalogProviderToken } from '../catalog/catalog.constants';
import { CatalogProvider } from '../catalog/catalogProvider';
import { CatalogSource } from '../catalog/catalogSource.enum';
import { Venue } from '../venues/venue.entity';
import { VenueSeat } from '../venues/venueSeat.entity';
import { AdmissionMode } from './admissionMode.enum';
import { CreateMovieEventRequestDto } from './dto/createMovieEventRequest.dto';
import { DiscoverEventsQueryDto } from './dto/discoverEventsQuery.dto';
import { Event } from './event.entity';
import { EventCategory } from './eventCategory.enum';
import { EventSeat } from './eventSeat.entity';
import { EventStatus } from './eventStatus.enum';
import { CatalogItemNotFoundError } from './errors/catalogItemNotFound.error';
import { EventCannotBePublishedError } from './errors/eventCannotBePublished.error';
import { EventMustStartInFutureError } from './errors/eventMustStartInFuture.error';
import { EventNotFoundError } from './errors/eventNotFound.error';
import { InvalidEventDiscoveryPeriodError } from './errors/invalidEventDiscoveryPeriod.error';
import { VenueHasNoSeatsError } from './errors/venueHasNoSeats.error';
import { VenueNotFoundError } from './errors/venueNotFound.error';
import { venueLocalDateTimeToDate } from './time/venueLocalDateTime';

const eventDiscoveryPageSize = 12;

interface EventDiscoveryPage {
  events: Event[];
  page: number;
  hasMore: boolean;
}

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
   * Descobre ocorrências públicas futuras usando somente o snapshot persistido localmente.
   * Datas de calendário são comparadas no timezone canônico de cada Venue.
   *
   * @param filters - Busca, filtros e página validados pelo contrato HTTP.
   * @returns Página ordenada e indicação de continuidade para carregamento infinito.
   */
  public async discover(filters: DiscoverEventsQueryDto): Promise<EventDiscoveryPage> {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      throw new InvalidEventDiscoveryPeriodError();
    }

    const queryBuilder = this.eventsRepository
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.venue', 'venue')
      .where('"event"."status" = :publishedStatus', {
        publishedStatus: EventStatus.Published,
      })
      .andWhere('"event"."startsAt" > CURRENT_TIMESTAMP');

    if (filters.query) {
      const searchPattern = `%${this.escapeLikePattern(filters.query)}%`;

      queryBuilder.andWhere(
        new Brackets((search) => {
          search
            .where('"event"."title" ILIKE :searchPattern', { searchPattern })
            .orWhere('COALESCE("event"."description", \'\') ILIKE :searchPattern');
        }),
      );
    }

    if (filters.category) {
      queryBuilder.andWhere('"event"."category" = :category', {
        category: filters.category,
      });
    }

    if (filters.genre) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM unnest("event"."genres") AS "eventGenre" WHERE LOWER("eventGenre") = LOWER(:genre))',
        { genre: filters.genre },
      );
    }

    if (filters.city) {
      queryBuilder.andWhere('LOWER("venue"."city") = LOWER(:city)', { city: filters.city });
    }

    if (filters.dateFrom) {
      queryBuilder.andWhere(
        '("event"."startsAt" AT TIME ZONE "venue"."timeZone")::date >= CAST(:dateFrom AS date)',
        { dateFrom: filters.dateFrom },
      );
    }

    if (filters.dateTo) {
      queryBuilder.andWhere(
        '("event"."startsAt" AT TIME ZONE "venue"."timeZone")::date <= CAST(:dateTo AS date)',
        { dateTo: filters.dateTo },
      );
    }

    const offset = (filters.page - 1) * eventDiscoveryPageSize;
    const events = await queryBuilder
      .orderBy('event.startsAt', 'ASC')
      .addOrderBy('event.id', 'ASC')
      .skip(offset)
      .take(eventDiscoveryPageSize + 1)
      .getMany();
    const hasMore = events.length > eventDiscoveryPageSize;

    return {
      events: hasMore ? events.slice(0, eventDiscoveryPageSize) : events,
      page: filters.page,
      hasMore,
    };
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

  /**
   * Escapa curingas do `ILIKE` para que o texto informado seja pesquisado literalmente.
   *
   * @param value - Busca já normalizada pelo DTO.
   * @returns Padrão seguro para inclusão entre curingas controlados pela aplicação.
   */
  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
  }
}
