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
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { CreateReservationRequestDto } from './dto/createReservationRequest.dto';
import { CreateReservationResponseDto } from './dto/createReservationResponse.dto';
import { CreateGeneralAdmissionReservationRequestDto } from './dto/createGeneralAdmissionReservationRequest.dto';
import { GetActiveReservationQueryDto } from './dto/getActiveReservationQuery.dto';
import { ReservationDetailResponseDto } from './dto/reservationDetailResponse.dto';
import {
  ApiCancelReservation,
  ApiCreateReservation,
  ApiCreateGeneralAdmissionReservation,
  ApiGetActiveReservation,
  ApiGetReservation,
} from './reservations.swagger';
import { ReservationsService } from './reservations.service';

@ApiTags('Reservations')
@Controller('reservations')
export class ReservationsController {
  public constructor(private readonly reservationsService: ReservationsService) {}

  /** Cria um hold seated para o CUSTOMER autenticado após a aquisição atômica do inventário. */
  @Post()
  @Roles(UserRole.Customer)
  @ApiCreateReservation()
  public async create(
    @Req() request: AuthenticatedRequest,
    @Body() data: CreateReservationRequestDto,
  ): Promise<CreateReservationResponseDto> {
    const { reservation, items } = await this.reservationsService.create(request.user.id, data);
    return CreateReservationResponseDto.fromReservation(reservation, items);
  }

  /** Cria um hold agregado GA para a quantidade integral solicitada pelo CUSTOMER. */
  @Post('general-admission')
  @Roles(UserRole.Customer)
  @ApiCreateGeneralAdmissionReservation()
  public async createGeneralAdmission(
    @Req() request: AuthenticatedRequest,
    @Body() data: CreateGeneralAdmissionReservationRequestDto,
  ): Promise<CreateReservationResponseDto> {
    const { reservation, items } = await this.reservationsService.createGeneralAdmission(
      request.user.id,
      data,
    );
    return CreateReservationResponseDto.fromReservation(reservation, items);
  }

  /**
   * Retorna a Reservation ativa do CUSTOMER para um Event, quando ainda não tiver expirado.
   */
  @Get('active')
  @Roles(UserRole.Customer)
  @ApiGetActiveReservation()
  public async findActive(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetActiveReservationQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReservationDetailResponseDto | void> {
    const detail = await this.reservationsService.findActive(request.user.id, query.eventId);

    if (!detail) {
      response.status(HttpStatus.NO_CONTENT);
      return;
    }

    return ReservationDetailResponseDto.fromDetail(detail);
  }

  /**
   * Retorna uma Reservation do CUSTOMER autenticado.
   */
  @Get(':reservationId')
  @Roles(UserRole.Customer)
  @ApiGetReservation()
  public async findOwned(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ): Promise<ReservationDetailResponseDto> {
    const detail = await this.reservationsService.findOwned(request.user.id, reservationId);
    return ReservationDetailResponseDto.fromDetail(detail);
  }

  /**
   * Cancela uma Reservation ativa e libera seu inventário no mesmo commit.
   */
  @Post(':reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.Customer)
  @ApiCancelReservation()
  public async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ): Promise<ReservationDetailResponseDto> {
    const detail = await this.reservationsService.cancel(request.user.id, reservationId);
    return ReservationDetailResponseDto.fromDetail(detail);
  }
}
