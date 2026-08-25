import { ApiProperty } from '@nestjs/swagger';

import { OrganizerEventWithStats } from '../repositories/eventRepository.interfaces';
import { OrganizerEventResponseDto } from './organizerEventResponse.dto';

export class OrganizerEventsPageResponseDto {
  @ApiProperty({ type: OrganizerEventResponseDto, isArray: true })
  public items!: OrganizerEventResponseDto[];

  @ApiProperty({ minimum: 1 })
  public page!: number;

  @ApiProperty()
  public hasMore!: boolean;

  public static fromEventsWithStats(
    eventsWithStats: OrganizerEventWithStats[],
    page: number,
    hasMore: boolean,
  ): OrganizerEventsPageResponseDto {
    return {
      items: eventsWithStats.map(OrganizerEventResponseDto.fromEvent),
      page,
      hasMore,
    };
  }
}
