import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RateLimit } from '../../rateLimit/rateLimit.decorator';
import { RateLimitPolicy } from '../../rateLimit/rateLimitPolicy.enum';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { PaymentIdempotencyKey } from './decorators/paymentIdempotencyKey.decorator';
import { CreateHostedCheckoutRequestDto } from './dto/createHostedCheckoutRequest.dto';
import { HostedCheckoutResponseDto } from './dto/hostedCheckoutResponse.dto';
import { TrustedPaymentOriginGuard } from './guards/trustedPaymentOrigin.guard';
import { HostedCheckoutService } from './hostedCheckout.service';
import {
  ApiCreateHostedCheckout,
  ApiGetHostedCheckout,
  ApiResumeHostedCheckout,
} from './payments.swagger';

@ApiTags('Payments')
@Controller('reservations/:reservationId/payments/hosted')
@applyDecorators(
  Roles(UserRole.Customer),
  UseGuards(TrustedPaymentOriginGuard),
  RateLimit(RateLimitPolicy.HostedCheckout),
)
export class HostedCheckoutController {
  public constructor(private readonly checkout: HostedCheckoutService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiCreateHostedCheckout()
  public async start(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @PaymentIdempotencyKey() idempotencyKey: string,
    @Body() data: CreateHostedCheckoutRequestDto,
  ) {
    return HostedCheckoutResponseDto.fromCheckout(
      await this.checkout.start(request.user.id, reservationId, idempotencyKey, data.method),
    );
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiGetHostedCheckout()
  public async find(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ) {
    return HostedCheckoutResponseDto.fromCheckout(
      await this.checkout.find(request.user.id, reservationId),
    );
  }

  @Post(':paymentId/resume')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiResumeHostedCheckout()
  public async resume(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return HostedCheckoutResponseDto.fromCheckout(
      await this.checkout.resume(request.user.id, reservationId, paymentId),
    );
  }
}
