import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdmissionMode } from '../admissionMode.enum';
import { EventCategory } from '../eventCategory.enum';
import { EventStatus } from '../eventStatus.enum';
import { OrganizerEventWithStats } from '../repositories/eventRepository.interfaces';

export class OrganizerEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public venueId!: string;

  @ApiProperty()
  public venueName!: string;

  @ApiProperty()
  public venueCity!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  public venueTimeZone!: string;

  @ApiProperty()
  public title!: string;

  @ApiPropertyOptional()
  public description?: string;

  @ApiPropertyOptional({ format: 'uri' })
  public imageUrl?: string;

  @ApiProperty({ type: [String] })
  public genres!: string[];

  @ApiProperty({ enum: EventCategory })
  public category!: EventCategory;

  @ApiProperty({ enum: AdmissionMode })
  public admissionMode!: AdmissionMode;

  @ApiProperty({ enum: EventStatus })
  public status!: EventStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  public startsAt!: Date;

  @ApiProperty({ minimum: 0 })
  public priceCents!: number;

  @ApiProperty()
  public isActive!: boolean;

  @ApiProperty({ minimum: 0 })
  public soldTickets!: number;

  @ApiPropertyOptional({ minimum: 0 })
  public inventoryTotal!: number | null;

  @ApiProperty({ minimum: 0 })
  public revenueCents!: number;

  /**
   * Constrói o contrato do painel sem expor relações ou metadados internos da entidade.
   *
   * @param organizerEvent - Event e métricas agregadas carregadas para o organizador.
   * @returns Dados necessários para gestão inicial pelo organizador.
   */
  public static fromEvent({
    event,
    isActive,
    soldTickets,
    inventoryTotal,
    revenueCents,
  }: OrganizerEventWithStats): OrganizerEventResponseDto {
    return {
      id: event.id,
      venueId: event.venueId,
      venueName: event.venue.name,
      venueCity: event.venue.city,
      venueTimeZone: event.venue.timeZone,
      title: event.title,
      description: event.description ?? undefined,
      imageUrl: event.imageUrl ?? undefined,
      genres: event.genres,
      category: event.category,
      admissionMode: event.admissionMode,
      status: event.status,
      startsAt: event.startsAt,
      priceCents: event.priceCents,
      isActive,
      soldTickets,
      inventoryTotal,
      revenueCents,
    };
  }
}
