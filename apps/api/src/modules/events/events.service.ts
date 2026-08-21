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
import { EventRepository } from './repositories/event.repository';
import { EventSeatRepository } from './repositories/eventSeat.repository';
import { EventDiscoveryPage, PublicEventDetail } from './repositories/eventRepository.interfaces';
import { PublicEventSeatMapItem } from './repositories/eventSeatRepository.interfaces';
import { venueLocalDateTimeToDate } from './time/venueLocalDateTime';

@Injectable()
export class EventsService {
  public constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    private readonly eventRepository: EventRepository,
    private readonly eventSeatRepository: EventSeatRepository,
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

    return this.eventRepository.discover(filters);
  }

  /**
   * Carrega uma ocorrência pública sem consultar novamente o catálogo externo.
   * DRAFT permanece indistinguível de um identificador inexistente e o PostgreSQL determina se o início passou.
   *
   * @param eventId - Identificador público da ocorrência.
   * @returns Event com Venue e seu estado temporal no instante da consulta.
   */
  public async findPublicDetail(eventId: string): Promise<PublicEventDetail> {
    const detail = await this.eventRepository.findPublicDetail(eventId);

    if (!detail) {
      throw new EventNotFoundError();
    }

    return detail;
  }

  /**
   * Carrega o mapa seated de uma ocorrência pública sem expor vínculos de hold de outros clientes.
   *
   * @param eventId - Identificador público da ocorrência.
   * @returns Assentos materializados e seus estados temporais calculados pelo banco.
   */
  public async findPublicSeatMap(eventId: string): Promise<PublicEventSeatMapItem[]> {
    const seats = await this.eventSeatRepository.findPublicMap(eventId);

    if (!seats) {
      throw new EventNotFoundError();
    }

    return seats;
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
