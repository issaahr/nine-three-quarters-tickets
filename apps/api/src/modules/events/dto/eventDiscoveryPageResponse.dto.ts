import { ApiProperty } from '@nestjs/swagger';

import { Event } from '../event.entity';
import { EventDiscoveryItemResponseDto } from './eventDiscoveryItemResponse.dto';

export class EventDiscoveryPageResponseDto {
  @ApiProperty({ type: EventDiscoveryItemResponseDto, isArray: true })
  public items!: EventDiscoveryItemResponseDto[];

  @ApiProperty({ minimum: 1 })
  public page!: number;

  @ApiProperty()
  public hasMore!: boolean;

  /**
   * Converte a página interna no formato consumível por paginação infinita.
   *
   * @param events - Events da página atual, já sem o item sentinela.
   * @param page - Página solicitada.
   * @param hasMore - Indica a existência de uma próxima página.
   * @returns Página pública com contratos próprios de resposta.
   */
  public static fromEvents(
    events: Event[],
    page: number,
    hasMore: boolean,
  ): EventDiscoveryPageResponseDto {
    return {
      items: events.map(EventDiscoveryItemResponseDto.fromEvent),
      page,
      hasMore,
    };
  }
}
