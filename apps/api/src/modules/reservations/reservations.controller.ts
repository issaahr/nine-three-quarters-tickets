import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { CreateReservationRequestDto } from './dto/createReservationRequest.dto';
import { CreateReservationResponseDto } from './dto/createReservationResponse.dto';
import { ApiCreateReservation } from './reservations.swagger';
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
}
