import {
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

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { PaymentIdempotencyKey } from './decorators/paymentIdempotencyKey.decorator';
import { CreateCardPaymentRequestDto } from './dto/createCardPaymentRequest.dto';
import { PaymentResponseDto } from './dto/paymentResponse.dto';
import { SimulatedPixPaymentResponseDto } from './dto/simulatedPixPaymentResponse.dto';
import { TrustedPaymentOriginGuard } from './guards/trustedPaymentOrigin.guard';
import { FakePaymentsModeGuard } from './guards/fakePaymentsMode.guard';
import {
  ApiCreateCardPayment,
  ApiCreateSimulatedPixPayment,
  ApiGetSimulatedPixPayment,
  ApiSettleSimulatedPixPayment,
} from './payments.swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('reservations/:reservationId/payments')
@UseGuards(FakePaymentsModeGuard)
export class PaymentsController {
  public constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Inicia uma tentativa idempotente de pagamento por cartão para uma Reservation do CUSTOMER.
   *
   * @param request - Requisição autenticada cujo usuário define a propriedade da reserva.
   * @param reservationId - Identificador da reserva à qual a tentativa deve pertencer.
   * @param idempotencyKey - Chave estável reutilizada nas repetições da mesma intenção de pagamento.
   * @param data - Dados do cartão validados na borda HTTP para processamento simulado.
   * @returns Resposta pública da tentativa após processamento simulado, sem expor a entidade de persistência.
   */
  @Post('card')
  @Roles(UserRole.Customer)
  @ApiCreateCardPayment()
  public async createCardPayment(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @PaymentIdempotencyKey() idempotencyKey: string,
    @Body() data: CreateCardPaymentRequestDto,
  ): Promise<PaymentResponseDto> {
    const payment = await this.paymentsService.processCardPayment(
      request.user.id,
      reservationId,
      idempotencyKey,
      data,
    );

    return PaymentResponseDto.fromPayment(payment);
  }

  @Post('pix')
  @Roles(UserRole.Customer)
  @ApiCreateSimulatedPixPayment()
  public async createSimulatedPixPayment(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @PaymentIdempotencyKey() idempotencyKey: string,
  ) {
    const result = await this.paymentsService.createSimulatedPixPayment(
      request.user.id,
      reservationId,
      idempotencyKey,
    );
    return SimulatedPixPaymentResponseDto.fromSimulatedPixPayment(result);
  }

  @Get('pix')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.Customer)
  @ApiGetSimulatedPixPayment()
  public async getSimulatedPixPayment(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ) {
    const result = await this.paymentsService.findSimulatedPixForCheckout(
      request.user.id,
      reservationId,
    );
    return SimulatedPixPaymentResponseDto.fromSimulatedPixPayment(result);
  }

  @Post('pix/:paymentId/settle')
  @HttpCode(HttpStatus.OK)
  @ApiSettleSimulatedPixPayment()
  @UseGuards(TrustedPaymentOriginGuard)
  @Roles(UserRole.Customer)
  public async settleSimulatedPixPayment(
    @Req() request: AuthenticatedRequest,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    const result = await this.paymentsService.settleSimulatedPixPayment(
      request.user.id,
      reservationId,
      paymentId,
    );
    return SimulatedPixPaymentResponseDto.fromSimulatedPixPayment(result);
  }
}
