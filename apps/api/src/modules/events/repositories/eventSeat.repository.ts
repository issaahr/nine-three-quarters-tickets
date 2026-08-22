import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdmissionMode } from '../admissionMode.enum';
import { EventSeat } from '../eventSeat.entity';
import { EventSeatStatus } from '../eventSeatStatus.enum';
import { EventStatus } from '../eventStatus.enum';
import { PublicEventSeatMapItem } from './eventSeatRepository.interfaces';

/**
 * Consulta o mapa seated público a partir do inventário materializado da ocorrência.
 */
@Injectable()
export class EventSeatRepository {
  public constructor(
    @InjectRepository(EventSeat)
    private readonly repository: Repository<EventSeat>,
  ) {}

  /**
   * Retorna o layout e o estado temporal calculado pelo PostgreSQL, ou null quando o mapa não é público.
   *
   * `CURRENT_TIMESTAMP` é a referência para que um hold expirado não dependa de limpeza assíncrona.
   */
  public async findPublicMap(eventId: string): Promise<PublicEventSeatMapItem[] | null> {
    const result = await this.repository
      .createQueryBuilder('eventSeat')
      .innerJoin('eventSeat.event', 'event')
      .innerJoinAndSelect('eventSeat.venueSeat', 'venueSeat')
      .addSelect(
        `CASE
          WHEN "eventSeat"."soldAt" IS NOT NULL THEN '${EventSeatStatus.Sold}'
          WHEN "eventSeat"."holdExpiresAt" > CURRENT_TIMESTAMP THEN '${EventSeatStatus.Held}'
          ELSE '${EventSeatStatus.Available}'
        END`,
        'eventSeatStatus',
      )
      .where('"eventSeat"."eventId" = :eventId', { eventId })
      .andWhere('"event"."status" IN (:...publicStatuses)', {
        publicStatuses: [EventStatus.Published, EventStatus.Cancelled],
      })
      .andWhere('"event"."admissionMode" = :admissionMode', {
        admissionMode: AdmissionMode.Seated,
      })
      .orderBy('"venueSeat"."y"', 'ASC')
      .addOrderBy('"venueSeat"."x"', 'ASC')
      .getRawAndEntities();

    if (result.entities.length === 0) {
      return null;
    }

    return result.entities.map((seat, index) => ({
      id: seat.id,
      label: seat.venueSeat.label,
      row: seat.venueSeat.row,
      number: seat.venueSeat.number,
      x: seat.venueSeat.x,
      y: seat.venueSeat.y,
      status: result.raw[index]?.eventSeatStatus as EventSeatStatus,
    }));
  }
}
