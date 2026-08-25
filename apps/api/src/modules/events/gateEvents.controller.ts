import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { GateEventResponseDto } from './dto/gateEventResponse.dto';
import { GateEventsPageResponseDto } from './dto/gateEventsPageResponse.dto';
import { GateEventsQueryDto } from './dto/gateEventsQuery.dto';
import { ApiGetGateEvent, ApiListGateEvents } from './events.swagger';
import { EventsService } from './events.service';

@ApiTags('Gate Events')
@Controller('gate/events')
export class GateEventsController {
  public constructor(private readonly eventsService: EventsService) {}

  /**
   * Lista as ocorrências publicadas que podem compor o contexto ativo da portaria com paginação server-side.
   */
  @Get()
  @Roles(UserRole.Gate)
  @ApiListGateEvents()
  public async listOperable(
    @Query() query: GateEventsQueryDto,
  ): Promise<GateEventsPageResponseDto> {
    const page = await this.eventsService.findOperableForGate(query);
    return GateEventsPageResponseDto.fromEvents(page.events, page.page, page.hasMore);
  }

  /**
   * Obtém os detalhes contextuais de um evento específico publicado para a portaria.
   */
  @Get(':eventId')
  @Roles(UserRole.Gate)
  @ApiGetGateEvent()
  public async getOperableById(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<GateEventResponseDto> {
    const event = await this.eventsService.findOperableGateEventById(eventId);
    return GateEventResponseDto.fromEvent(event);
  }
}
