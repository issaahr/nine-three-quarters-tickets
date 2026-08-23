import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdmissionMode } from '../admissionMode.enum';
import { Event } from '../event.entity';
import { EventCategory } from '../eventCategory.enum';
import { EventStatus } from '../eventStatus.enum';

export class EventMutationResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public venueId!: string;

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

  @ApiPropertyOptional({ minimum: 1 })
  public capacity?: number;

  /**
   * Mapeia somente os campos necessários após criar ou publicar qualquer modalidade de Event.
   *
   * @param event - Event persistido após a mutação.
   * @returns Contrato HTTP comum a Events SEATED e GENERAL_ADMISSION.
   */
  public static fromEvent(event: Event): EventMutationResponseDto {
    return {
      id: event.id,
      venueId: event.venueId,
      title: event.title,
      description: event.description ?? undefined,
      imageUrl: event.imageUrl ?? undefined,
      genres: event.genres,
      category: event.category,
      admissionMode: event.admissionMode,
      status: event.status,
      startsAt: event.startsAt,
      priceCents: event.priceCents,
      capacity: event.capacity ?? undefined,
    };
  }
}
