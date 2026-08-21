import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdmissionMode } from '../admissionMode.enum';
import { Event } from '../event.entity';
import { EventCategory } from '../eventCategory.enum';

export class EventDiscoveryItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

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

  @ApiProperty({ type: String, format: 'date-time' })
  public startsAt!: Date;

  @ApiProperty({ minimum: 0 })
  public priceCents!: number;

  @ApiProperty()
  public venueName!: string;

  @ApiProperty()
  public venueCity!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  public venueTimeZone!: string;

  /**
   * Constrói o card público somente com o snapshot local e o Venue associado.
   *
   * @param event - Event publicado carregado com seu Venue.
   * @returns Contrato necessário para descoberta sem consultar o catálogo externo.
   */
  public static fromEvent(event: Event): EventDiscoveryItemResponseDto {
    return {
      id: event.id,
      title: event.title,
      description: event.description ?? undefined,
      imageUrl: event.imageUrl ?? undefined,
      genres: event.genres,
      category: event.category,
      admissionMode: event.admissionMode,
      startsAt: event.startsAt,
      priceCents: event.priceCents,
      venueName: event.venue.name,
      venueCity: event.venue.city,
      venueTimeZone: event.venue.timeZone,
    };
  }
}
