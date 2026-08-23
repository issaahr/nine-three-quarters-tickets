import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { CreateMovieEventRequestDto } from './dto/createMovieEventRequest.dto';
import { CreateShowEventRequestDto } from './dto/createShowEventRequest.dto';
import { DiscoverEventsQueryDto } from './dto/discoverEventsQuery.dto';
import { EventMutationResponseDto } from './dto/eventMutationResponse.dto';
import { EventDetailResponseDto } from './dto/eventDetailResponse.dto';
import { EventDiscoveryPageResponseDto } from './dto/eventDiscoveryPageResponse.dto';
import { EventSeatMapItemResponseDto } from './dto/eventSeatMapItemResponse.dto';
import {
  ApiCreateMovieEvent,
  ApiCreateShowEvent,
  ApiDiscoverEvents,
  ApiGetEventDetail,
  ApiGetEventSeatMap,
  ApiPublishEvent,
} from './events.swagger';
import { EventsService } from './events.service';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  public constructor(private readonly eventsService: EventsService) {}

  /**
   * Descobre ocorrências publicadas sem exigir autenticação ou acesso ao catálogo externo.
   */
  @Get()
  @ApiDiscoverEvents()
  public async discover(
    @Query() query: DiscoverEventsQueryDto,
  ): Promise<EventDiscoveryPageResponseDto> {
    const result = await this.eventsService.discover(query);
    return EventDiscoveryPageResponseDto.fromEvents(result.events, result.page, result.hasMore);
  }

  /**
   * Retorna o mapa materializado de assentos e o estado temporal de cada posição.
   */
  @Get(':eventId/seats')
  @ApiGetEventSeatMap()
  public async findPublicSeatMap(
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ): Promise<EventSeatMapItemResponseDto[]> {
    const seats = await this.eventsService.findPublicSeatMap(eventId);
    return seats.map(EventSeatMapItemResponseDto.fromPublicSeat);
  }

  /**
   * Retorna uma única ocorrência pública, inclusive quando passada ou cancelada.
   */
  @Get(':eventId')
  @ApiGetEventDetail()
  public async findPublicDetail(
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ): Promise<EventDetailResponseDto> {
    const result = await this.eventsService.findPublicDetail(eventId);
    return EventDetailResponseDto.fromPublicEvent(result.event, result.isPast);
  }

  /**
   * Cria um Event para o organizador autenticado e o converte para o contrato HTTP.
   */
  @Post('movies')
  @Roles(UserRole.Organizer)
  @ApiCreateMovieEvent()
  public async createMovie(
    @Req() request: AuthenticatedRequest,
    @Body() data: CreateMovieEventRequestDto,
  ): Promise<EventMutationResponseDto> {
    const event = await this.eventsService.createMovie(request.user.id, data);
    return EventMutationResponseDto.fromEvent(event);
  }

  /** Cria um show GA a partir da atração, Venue, horário, preço e capacidade locais. */
  @Post('shows')
  @Roles(UserRole.Organizer)
  @ApiCreateShowEvent()
  public async createShow(
    @Req() request: AuthenticatedRequest,
    @Body() data: CreateShowEventRequestDto,
  ): Promise<EventMutationResponseDto> {
    const event = await this.eventsService.createShow(request.user.id, data);
    return EventMutationResponseDto.fromEvent(event);
  }

  /**
   * Publica a ocorrência do organizador autenticado e materializa seu inventário.
   */
  @Post(':eventId/publish')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.Organizer)
  @ApiPublishEvent()
  public async publish(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ): Promise<EventMutationResponseDto> {
    const event = await this.eventsService.publish(request.user.id, eventId);
    return EventMutationResponseDto.fromEvent(event);
  }
}
