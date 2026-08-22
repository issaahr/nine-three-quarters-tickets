import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { PaymentResponseDto } from './dto/paymentResponse.dto';

/**
 * Agrupa a documentação da criação idempotente de uma tentativa de cartão.
 */
export function ApiCreateCardPayment() {
  return applyDecorators(
    ApiOperation({ summary: 'Inicia uma tentativa idempotente de pagamento por cartão' }),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      schema: { type: 'string', format: 'uuid' },
      description: 'UUID reutilizado em retries técnicos da mesma tentativa.',
    }),
    ApiCreatedResponse({ type: PaymentResponseDto }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Dados de cartão ou idempotency key inválidos.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Reservation inexistente ou não pertencente ao CUSTOMER.',
    }),
    ApiConflictResponse({
      type: ApplicationErrorResponseDto,
      description: 'Reservation expirada, inativa, paga ou com pagamento em andamento.',
    }),
  );
}
