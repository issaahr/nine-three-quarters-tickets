import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { GateEventResponseDto } from './dto/gateEventResponse.dto';
import { ApiListGateEvents } from './events.swagger';
import { EventsService } from './events.service';

@ApiTags('Gate Events')
@Controller('gate/events')
export class GateEventsController {
  public constructor(private readonly eventsService: EventsService) {}

  /**
   * Lista as ocorrências publicadas que podem compor o contexto ativo da portaria.
   */
  @Get()
  @Roles(UserRole.Gate)
  @ApiListGateEvents()
  public async listOperable(): Promise<GateEventResponseDto[]> {
    const events = await this.eventsService.findOperableForGate();
    return events.map(GateEventResponseDto.fromEvent);
  }
}
