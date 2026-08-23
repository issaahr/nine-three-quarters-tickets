import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { RateLimitedRoles } from '../../rateLimit/rateLimit.decorator';
import { RateLimitPolicy } from '../../rateLimit/rateLimitPolicy.enum';
import { CheckInManualCodeRequestDto } from './dto/checkInManualCodeRequest.dto';
import { CheckInResponseDto } from './dto/checkInResponse.dto';
import { CheckInTicketRequestDto } from './dto/checkInTicketRequest.dto';
import { ApiCheckInManualCode, ApiCheckInTicket } from './tickets.swagger';
import { TicketsService } from './tickets.service';

@ApiTags('Gate Tickets')
@Controller('gate/events/:eventId/check-in')
export class GateTicketsController {
  public constructor(private readonly ticketsService: TicketsService) {}

  /** Valida uma credencial QR no contexto explícito da portaria. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.Gate)
  @ApiCheckInTicket()
  public async checkInCredential(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() data: CheckInTicketRequestDto,
  ): Promise<CheckInResponseDto> {
    const result = await this.ticketsService.checkInCredential(
      eventId,
      request.user.id,
      data.credential,
    );

    return CheckInResponseDto.fromResult(result);
  }

  /** Valida um código manual no mesmo fluxo atômico usado pela leitura QR. */
  @Post('manual-code')
  @HttpCode(HttpStatus.OK)
  @RateLimitedRoles(RateLimitPolicy.ManualCheckIn, UserRole.Gate)
  @ApiCheckInManualCode()
  public async checkInManualCode(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() data: CheckInManualCodeRequestDto,
  ): Promise<CheckInResponseDto> {
    const result = await this.ticketsService.checkInManualCode(
      eventId,
      request.user.id,
      data.manualCode,
    );

    return CheckInResponseDto.fromResult(result);
  }
}
