import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { movieCatalogProviderToken, showCatalogProviderToken } from '../catalog/catalog.constants';
import { CatalogProvider, MovieCatalogProvider } from '../catalog/catalogProvider';
import { CatalogSource } from '../catalog/catalogSource.enum';
import { Venue } from '../venues/venue.entity';
import { VenueSeat } from '../venues/venueSeat.entity';
import { AdmissionMode } from './admissionMode.enum';
import { CreateMovieEventRequestDto } from './dto/createMovieEventRequest.dto';
import { CreateShowEventRequestDto } from './dto/createShowEventRequest.dto';
import { DiscoverEventsQueryDto } from './dto/discoverEventsQuery.dto';
import { Event } from './event.entity';
import { EventCategory } from './eventCategory.enum';
import { EventSeat } from './eventSeat.entity';
import { EventStatus } from './eventStatus.enum';
import { SeatRealtimeGateway } from '../realtime/seatRealtime.gateway';
import { CatalogItemNotFoundError } from './errors/catalogItemNotFound.error';
import { EventCannotBePublishedError } from './errors/eventCannotBePublished.error';
import { EventMustStartInFutureError } from './errors/eventMustStartInFuture.error';
import { EventNotFoundError } from './errors/eventNotFound.error';
import { InvalidEventDiscoveryPeriodError } from './errors/invalidEventDiscoveryPeriod.error';
import { VenueHasNoSeatsError } from './errors/venueHasNoSeats.error';
import { VenueNotFoundError } from './errors/venueNotFound.error';
import { EventRepository } from './repositories/event.repository';
import { EventSeatRepository } from './repositories/eventSeat.repository';
import {
  EventDiscoveryPage,
  OrganizerEventWithStats,
  PublicEventDetail,
} from './repositories/eventRepository.interfaces';
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
    @Inject(movieCatalogProviderToken)
    private readonly movieCatalogProvider: MovieCatalogProvider,
    @Inject(showCatalogProviderToken)
    private readonly showCatalogProvider: CatalogProvider,
    private readonly dataSource: DataSource,
    private readonly seatRealtimeGateway: SeatRealtimeGateway,
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

    const catalogItem = await this.movieCatalogProvider.findByExternalId(request.externalId);

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
   * Cria um DRAFT GENERAL_ADMISSION com capacidade local e snapshot confiável da atração.
   *
   * @param organizerId - Identidade do organizador obtida da sessão autenticada.
   * @param request - Referências externas e atributos comerciais definidos localmente.
   * @returns Event de show persistido sem materializar assentos ou consultar inventário externo.
   */
  public async createShow(organizerId: string, request: CreateShowEventRequestDto): Promise<Event> {
    const venue = await this.venuesRepository.findOneBy({ id: request.venueId });

    if (!venue) {
      throw new VenueNotFoundError();
    }

    const startsAt = venueLocalDateTimeToDate(request.startsAtLocal, venue.timeZone);

    if (startsAt.getTime() <= Date.now()) {
      throw new EventMustStartInFutureError();
    }

    const catalogItem = await this.showCatalogProvider.findByExternalId(request.externalId);

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
        category: EventCategory.Show,
        admissionMode: AdmissionMode.GeneralAdmission,
        status: EventStatus.Draft,
        startsAt,
        priceCents: request.priceCents,
        capacity: request.capacity,
        catalogSource: CatalogSource.Ticketmaster,
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
  public findByOrganizerId(organizerId: string): Promise<OrganizerEventWithStats[]> {
    return this.eventRepository.findForOrganizerWithStats(organizerId);
  }

  /**
   * Lista Events publicados para seleção da portaria sem inferir um fechamento temporal.
   *
   * @returns Ocorrências operáveis, carregadas com o Venue necessário ao contexto visual.
   */
  public findOperableForGate(): Promise<Event[]> {
    return this.eventsRepository.find({
      where: { status: EventStatus.Published },
      relations: { venue: true },
      order: { startsAt: 'ASC', id: 'ASC' },
    });
  }

  /**
   * Descobre ocorrências públicas usando somente o snapshot persistido localmente.
   * Eventos passados permanecem acessíveis quando a data é selecionada explicitamente no calendário local do Venue.
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
   * Publica atomicamente um Event, materializando o layout somente quando ele é SEATED.
   * Repetir a operação sobre um Event já publicado não recria inventário.
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

      if (event.status !== EventStatus.Draft) {
        throw new EventCannotBePublishedError();
      }

      if (event.startsAt.getTime() <= Date.now()) {
        throw new EventMustStartInFutureError();
      }

      if (event.admissionMode === AdmissionMode.Seated) {
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
      }

      event.status = EventStatus.Published;
      return eventsRepository.save(event);
    });
  }

  /**
   * Atualiza somente o preço vigente, preservando valores fotografados em compras existentes.
   *
   * @param organizerId - Identificador do organizador proprietário do Event.
   * @param eventId - Identificador do Event cujo preço será atualizado.
   * @param priceCents - Novo preço inteiro em centavos.
   * @returns Event com o preço vigente atualizado.
   */
  public async updatePrice(
    organizerId: string,
    eventId: string,
    priceCents: number,
  ): Promise<Event> {
    return this.eventRepository.updatePrice(organizerId, eventId, priceCents);
  }

  /**
   * Cancela uma ocorrência futura e anuncia os assentos liberados após o commit.
   *
   * @param organizerId - Identificador do organizador que solicita o cancelamento.
   * @param eventId - Identificador do Event futuro a ser cancelado.
   * @returns Event já cancelado.
   */
  public async cancel(organizerId: string, eventId: string): Promise<Event> {
    const result = await this.eventRepository.cancel(organizerId, eventId);

    if (result.releasedEventSeatIds.length > 0) {
      this.seatRealtimeGateway.emitReleased({ eventId, eventSeatIds: result.releasedEventSeatIds });
    }

    return result.event;
  }
}
