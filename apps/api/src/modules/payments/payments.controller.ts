import { Body, Controller, Headers, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { CreateCardPaymentRequestDto } from './dto/createCardPaymentRequest.dto';
import { PaymentResponseDto } from './dto/paymentResponse.dto';
import { InvalidIdempotencyKeyError } from './errors/invalidIdempotencyKey.error';
import { ApiCreateCardPayment } from './payments.swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('reservations/:reservationId/payments')
export class PaymentsController {
  public constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Inicia uma tentativa idempotente de pagamento por cartão para uma Reservation do CUSTOMER.
   */
  @Post('card')
  @Roles(UserRole.Customer)
  @ApiCreateCardPayment()
  public async createCardPayment(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() data: CreateCardPaymentRequestDto,
  ): Promise<PaymentResponseDto> {
    if (!isUUID(idempotencyKey, '4')) {
      throw new InvalidIdempotencyKeyError();
    }

    const payment = await this.paymentsService.processCardPayment(
      request.user.id,
      reservationId,
      idempotencyKey,
      data,
    );

    return PaymentResponseDto.fromPayment(payment);
  }
}
