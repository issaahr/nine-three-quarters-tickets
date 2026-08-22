import { ApiProperty } from '@nestjs/swagger';

import { EventSeatStatus } from '../eventSeatStatus.enum';
import { PublicEventSeatMapItem } from '../repositories/eventSeatRepository.interfaces';

export class EventSeatMapItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ example: 'B12' })
  public label!: string;

  @ApiProperty({ example: 'B' })
  public row!: string;

  @ApiProperty({ example: 12, minimum: 1 })
  public number!: number;

  @ApiProperty({ example: 12, minimum: 0 })
  public x!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  public y!: number;

  @ApiProperty({ enum: EventSeatStatus })
  public status!: EventSeatStatus;

  /**
   * Converte o inventário consultado com estado temporal em contrato público do mapa.
   */
  public static fromPublicSeat(seat: PublicEventSeatMapItem): EventSeatMapItemResponseDto {
    return seat;
  }
}
