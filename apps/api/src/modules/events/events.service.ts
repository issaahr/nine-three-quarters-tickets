import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { catalogProviderToken } from '../catalog/catalog.constants';
import { CatalogProvider } from '../catalog/catalogProvider';
import { CatalogSource } from '../catalog/catalogSource.enum';
import { CatalogItemNotFoundError } from '../catalog/errors/catalogItemNotFound.error';
import { Venue } from '../venues/venue.entity';
import { AdmissionMode } from './admissionMode.enum';
import { CreateMovieEventRequestDto } from './dto/createMovieEventRequest.dto';
import { Event } from './event.entity';
import { EventCategory } from './eventCategory.enum';
import { EventStatus } from './eventStatus.enum';
import { EventMustStartInFutureError } from './errors/eventMustStartInFuture.error';
import { VenueNotFoundError } from './errors/venueNotFound.error';
import { venueLocalDateTimeToDate } from './venueLocalDateTime';

@Injectable()
export class EventsService {
  public constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @Inject(catalogProviderToken)
    private readonly catalogProvider: CatalogProvider,
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
}
