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
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { OrganizerEventResponseDto } from './dto/organizerEventResponse.dto';
import { OrganizerEventsPageResponseDto } from './dto/organizerEventsPageResponse.dto';
import { OrganizerEventsQueryDto } from './dto/organizerEventsQuery.dto';
import { UpdateEventPriceRequestDto } from './dto/updateEventPriceRequest.dto';
import { ApiListOrganizerEvents } from './events.swagger';
import { EventsService } from './events.service';

@ApiTags('Organizer Events')
@Controller('organizer/me/events')
export class OrganizerEventsController {
  public constructor(private readonly eventsService: EventsService) {}

  /**
   * Lista somente as ocorrências pertencentes ao organizador autenticado com paginação server-side.
   */
  @Get()
  @Roles(UserRole.Organizer)
  @ApiListOrganizerEvents()
  public async listMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: OrganizerEventsQueryDto,
  ): Promise<OrganizerEventsPageResponseDto> {
    const page = await this.eventsService.findByOrganizerId(request.user.id, query);
    return OrganizerEventsPageResponseDto.fromEventsWithStats(page.items, page.page, page.hasMore);
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
    await this.eventsService.updatePrice(request.user.id, eventId, data.priceCents);
    const eventWithStats = await this.eventsService.findOrganizerEventById(
      request.user.id,
      eventId,
    );
    return OrganizerEventResponseDto.fromEvent(eventWithStats);
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
    await this.eventsService.cancel(request.user.id, eventId);
    const eventWithStats = await this.eventsService.findOrganizerEventById(
      request.user.id,
      eventId,
    );
    return OrganizerEventResponseDto.fromEvent(eventWithStats);
  }
}
