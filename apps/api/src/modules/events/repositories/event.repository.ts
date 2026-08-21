import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Event } from '../event.entity';
import { EventStatus } from '../eventStatus.enum';
import {
  EventDiscoveryFilters,
  EventDiscoveryPage,
  PublicEventDetail,
} from './eventRepository.interfaces';

const eventDiscoveryPageSize = 12;

/**
 * Concentra consultas semânticas de Event que exigem QueryBuilder ou valores calculados pelo PostgreSQL.
 */
@Injectable()
export class EventRepository {
  public constructor(
    @InjectRepository(Event)
    private readonly repository: Repository<Event>,
  ) {}

  /**
   * Descobre ocorrências públicas futuras aplicando filtros combináveis e calendário local do Venue.
   *
   * @param filters - Busca, filtros e página já validados pela camada HTTP.
   * @returns Página determinística e indicação de continuidade.
   */
  public async discover(filters: EventDiscoveryFilters): Promise<EventDiscoveryPage> {
    const queryBuilder = this.repository
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
   * Carrega uma ocorrência legível publicamente e calcula seu estado temporal no PostgreSQL.
   *
   * @param eventId - Identificador público da ocorrência.
   * @returns Event com Venue e estado temporal, ou null quando não estiver publicamente legível.
   */
  public async findPublicDetail(eventId: string): Promise<PublicEventDetail | null> {
    const result = await this.repository
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.venue', 'venue')
      .addSelect('"event"."startsAt" <= CURRENT_TIMESTAMP', 'eventIsPast')
      .where('"event"."id" = :eventId', { eventId })
      .andWhere('"event"."status" IN (:...publicStatuses)', {
        publicStatuses: [EventStatus.Published, EventStatus.Cancelled],
      })
      .getRawAndEntities();

    const event = result.entities[0];

    return event
      ? {
          event,
          isPast: result.raw[0]?.eventIsPast === true,
        }
      : null;
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
