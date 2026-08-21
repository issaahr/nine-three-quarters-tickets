import { ApiProperty } from '@nestjs/swagger';

import { Event } from '../event.entity';
import { EventStatus } from '../eventStatus.enum';
import { EventDiscoveryItemResponseDto } from './eventDiscoveryItemResponse.dto';

export class EventDetailResponseDto extends EventDiscoveryItemResponseDto {
  @ApiProperty({ enum: EventStatus })
  public status!: EventStatus;

  @ApiProperty({ description: 'Indica se o início da ocorrência já passou no relógio da API.' })
  public isPast!: boolean;

  /**
   * Acrescenta ao conteúdo público o estado necessário para uma leitura segura da ocorrência.
   *
   * @param event - Event persistido com seu Venue.
   * @param isPast - Resultado temporal calculado pelo PostgreSQL.
   * @returns Contrato público de uma única ocorrência.
   */
  public static fromPublicEvent(event: Event, isPast: boolean): EventDetailResponseDto {
    return {
      ...EventDiscoveryItemResponseDto.fromEvent(event),
      status: event.status,
      isPast,
    };
  }
}
