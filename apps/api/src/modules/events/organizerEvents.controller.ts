import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { OrganizerEventResponseDto } from './dto/organizerEventResponse.dto';
import { UpdateEventPriceRequestDto } from './dto/updateEventPriceRequest.dto';
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

  /**
   * Atualiza o preço vigente de uma ocorrência do organizador autenticado.
   */
  @Patch(':eventId/price')
  @Roles(UserRole.Organizer)
  public async updatePrice(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() data: UpdateEventPriceRequestDto,
  ): Promise<OrganizerEventResponseDto> {
    const event = await this.eventsService.updatePrice(request.user.id, eventId, data.priceCents);
    const events = await this.eventsService.findByOrganizerId(request.user.id);
    return OrganizerEventResponseDto.fromEvent(
      events.find(({ event: item }) => item.id === event.id)!,
    );
  }

  /**
   * Cancela uma ocorrência futura e seus vínculos comerciais associados.
   */
  @Post(':eventId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.Organizer)
  public async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<OrganizerEventResponseDto> {
    const event = await this.eventsService.cancel(request.user.id, eventId);
    const events = await this.eventsService.findByOrganizerId(request.user.id);
    return OrganizerEventResponseDto.fromEvent(
      events.find(({ event: item }) => item.id === event.id)!,
    );
  }
}
