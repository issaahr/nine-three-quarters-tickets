import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { CreateMovieEventRequestDto } from './dto/createMovieEventRequest.dto';
import { CreateMovieEventResponseDto } from './dto/createMovieEventResponse.dto';
import { ApiCreateMovieEvent } from './events.swagger';
import { EventsService } from './events.service';

interface AuthenticatedRequest {
  user: AuthenticatedUser;
}

@ApiTags('Events')
@Controller('events')
export class EventsController {
  public constructor(private readonly eventsService: EventsService) {}

  /**
   * Cria um Event para o organizador autenticado e o converte para o contrato HTTP.
   */
  @Post('movies')
  @Roles(UserRole.Organizer)
  @ApiCreateMovieEvent()
  public async createMovie(
    @Req() request: AuthenticatedRequest,
    @Body() data: CreateMovieEventRequestDto,
  ): Promise<CreateMovieEventResponseDto> {
    const event = await this.eventsService.createMovie(request.user.id, data);
    return CreateMovieEventResponseDto.fromEvent(event);
  }
}
