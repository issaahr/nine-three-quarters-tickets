import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Event } from '../event.entity';
import { EventStatus } from '../eventStatus.enum';
import { EventDiscoveryItemResponseDto } from './eventDiscoveryItemResponse.dto';

export class EventDetailResponseDto extends EventDiscoveryItemResponseDto {
  @ApiProperty({ enum: EventStatus })
  public status!: EventStatus;

  @ApiProperty({ description: 'Indica se o início da ocorrência já passou no relógio da API.' })
  public isPast!: boolean;

  @ApiPropertyOptional({ minimum: 1 })
  public capacity?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public availableQuantity?: number;

  /**
   * Acrescenta ao conteúdo público o estado necessário para uma leitura segura da ocorrência.
   *
   * @param event - Event persistido com seu Venue.
   * @param isPast - Resultado temporal calculado pelo PostgreSQL.
   * @param availableQuantity - Capacidade GA restante após holds válidos e compras confirmadas.
   * @returns Contrato público de uma única ocorrência.
   */
  public static fromPublicEvent(
    event: Event,
    isPast: boolean,
    availableQuantity: number | null,
  ): EventDetailResponseDto {
    return {
      ...EventDiscoveryItemResponseDto.fromEvent(event),
      status: event.status,
      isPast,
      capacity: event.capacity ?? undefined,
      availableQuantity: availableQuantity ?? undefined,
    };
  }
}
