import { ApiProperty } from '@nestjs/swagger';

import { Event } from '../event.entity';
import { GateEventResponseDto } from './gateEventResponse.dto';

export class GateEventsPageResponseDto {
  @ApiProperty({ type: GateEventResponseDto, isArray: true })
  public items!: GateEventResponseDto[];

  @ApiProperty({ minimum: 1 })
  public page!: number;

  @ApiProperty()
  public hasMore!: boolean;

  public static fromEvents(
    events: Event[],
    page: number,
    hasMore: boolean,
  ): GateEventsPageResponseDto {
    return {
      items: events.map(GateEventResponseDto.fromEvent),
      page,
      hasMore,
    };
  }
}
