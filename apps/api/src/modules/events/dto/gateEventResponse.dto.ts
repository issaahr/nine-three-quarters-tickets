import { ApiProperty } from '@nestjs/swagger';

import { Event } from '../event.entity';

/** Contrato mínimo para o GATE escolher a ocorrência que operará. */
export class GateEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty()
  public title!: string;

  @ApiProperty()
  public venueName!: string;

  @ApiProperty({ example: 'America/Fortaleza' })
  public venueTimeZone!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public startsAt!: Date;

  /** Converte o Event carregado com Venue para o contexto operacional da portaria. */
  public static fromEvent(event: Event): GateEventResponseDto {
    return {
      id: event.id,
      title: event.title,
      venueName: event.venue.name,
      venueTimeZone: event.venue.timeZone,
      startsAt: event.startsAt,
    };
  }
}
