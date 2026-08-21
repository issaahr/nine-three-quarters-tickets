import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { OrganizerEventResponseDto } from './dto/organizerEventResponse.dto';
import { ApiListOrganizerEvents } from './events.swagger';
import { EventsService } from './events.service';

@ApiTags('Organizer Events')
@Controller('organizer/me/events')
export class OrganizerEventsController {
  public constructor(private readonly eventsService: EventsService) {}

  /**
   * Lista somente as ocorrências pertencentes ao organizador autenticado.
   */
  @Get()
  @Roles(UserRole.Organizer)
  @ApiListOrganizerEvents()
  public async listMine(
    @Req() request: AuthenticatedRequest,
  ): Promise<OrganizerEventResponseDto[]> {
    const events = await this.eventsService.findByOrganizerId(request.user.id);
    return events.map(OrganizerEventResponseDto.fromEvent);
  }
}
