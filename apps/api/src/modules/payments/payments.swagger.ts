import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { PaymentResponseDto } from './dto/paymentResponse.dto';
import { HostedCheckoutResponseDto } from './dto/hostedCheckoutResponse.dto';
import { PaymentCheckoutConfigurationResponseDto } from './dto/paymentCheckoutConfigurationResponse.dto';
import { SimulatedPixPaymentResponseDto } from './dto/simulatedPixPaymentResponse.dto';
import { stripeWebhookSignatureHeader } from './stripe/stripeCheckout.constants';

export function ApiGetPaymentCheckoutConfiguration() {
  return applyDecorators(
    ApiOperation({ summary: 'Consulta o modo e os métodos habilitados no checkout do CUSTOMER' }),
    ApiOkResponse({ type: PaymentCheckoutConfigurationResponseDto }),
    ApiForbiddenResponse({ description: 'Papel sem acesso ao checkout do CUSTOMER.' }),
  );
}

export function ApiStripeCheckoutWebhook() {
  return applyDecorators(
    ApiOperation({ summary: 'Concilia atualizações de sessões Stripe do ambiente de teste' }),
    ApiHeader({ name: stripeWebhookSignatureHeader, required: true }),
    ApiNoContentResponse({ description: 'Notificação processada ou já conciliada.' }),
    ApiBadRequestResponse({
      description: 'Assinatura, formato ou ambiente da notificação inválido.',
    }),
    ApiNotFoundResponse({ description: 'Integração Stripe desabilitada.' }),
    ApiServiceUnavailableResponse({
      description: 'Não foi possível confirmar o estado atual no provedor.',
    }),
  );
}

const apiPaymentIdempotencyKey = ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'UUID reutilizado em retries técnicos da mesma tentativa.',
});

/**
 * Agrupa a documentação da criação idempotente de uma tentativa de cartão.
 */
export function ApiCreateCardPayment() {
  return applyDecorators(
    ApiOperation({ summary: 'Inicia uma tentativa idempotente de pagamento por cartão' }),
    apiPaymentIdempotencyKey,
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

export function ApiCreateSimulatedPixPayment() {
  return applyDecorators(
    ApiOperation({ summary: 'Inicia uma tentativa idempotente de PIX simulado' }),
    apiPaymentIdempotencyKey,
    ApiCreatedResponse({ type: SimulatedPixPaymentResponseDto }),
    ApiBadRequestResponse({ description: 'Identificador da Reservation ou chave inválida.' }),
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

export function ApiGetSimulatedPixPayment() {
  return applyDecorators(
    ApiOperation({ summary: 'Consulta o PIX simulado do checkout' }),
    ApiOkResponse({ type: SimulatedPixPaymentResponseDto }),
    ApiBadRequestResponse({ description: 'Identificador da Reservation inválido.' }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Tentativa de PIX ausente ou fora das Reservations do CUSTOMER.',
    }),
  );
}

export function ApiSettleSimulatedPixPayment() {
  return applyDecorators(
    ApiOperation({ summary: 'Solicita a conclusão idempotente do PIX simulado' }),
    ApiHeader({
      name: 'Origin',
      required: true,
      description: 'Origem do checkout presente na configuração de origens permitidas.',
    }),
    ApiOkResponse({
      type: SimulatedPixPaymentResponseDto,
      description: 'Tentativa PENDING antes do prazo, ou resultado terminal persistido.',
    }),
    ApiBadRequestResponse({
      description: 'Identificadores da Reservation ou do Payment inválidos.',
    }),
    ApiForbiddenResponse({
      type: ApplicationErrorResponseDto,
      description: 'Papel sem acesso ou origem ausente ou não autorizada.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Tentativa de PIX ausente ou fora das Reservations do CUSTOMER.',
    }),
  );
}

const apiHostedCheckoutUnavailable = ApiServiceUnavailableResponse({
  type: ApplicationErrorResponseDto,
  description: 'O provedor não pôde confirmar o estado. Retome a mesma tentativa.',
});

const apiHostedCheckoutNotFound = ApiNotFoundResponse({
  type: ApplicationErrorResponseDto,
  description: 'Checkout indisponível ou Reservation ou tentativa não encontrada para o CUSTOMER.',
});

const apiHostedCheckoutOrigin = ApiHeader({
  name: 'Origin',
  required: true,
  description: 'Origem do checkout presente na configuração de origens permitidas.',
});

export function ApiCreateHostedCheckout() {
  return applyDecorators(
    ApiOperation({ summary: 'Inicia ou repete uma tentativa idempotente de checkout hospedado' }),
    apiPaymentIdempotencyKey,
    apiHostedCheckoutOrigin,
    ApiCreatedResponse({ type: HostedCheckoutResponseDto }),
    ApiBadRequestResponse({ type: ValidationErrorResponseDto }),
    ApiForbiddenResponse({ description: 'Papel ou origem sem acesso.' }),
    apiHostedCheckoutNotFound,
    ApiConflictResponse({ description: 'Reserva inativa ou com outra tentativa ativa.' }),
    apiHostedCheckoutUnavailable,
  );
}

export function ApiGetHostedCheckout() {
  return applyDecorators(
    ApiOperation({ summary: 'Consulta a tentativa persistida de checkout hospedado' }),
    ApiOkResponse({ type: HostedCheckoutResponseDto }),
    apiHostedCheckoutNotFound,
    apiHostedCheckoutUnavailable,
  );
}

export function ApiResumeHostedCheckout() {
  return applyDecorators(
    ApiOperation({ summary: 'Retoma a mesma tentativa de checkout hospedado após uma falha' }),
    apiHostedCheckoutOrigin,
    ApiOkResponse({ type: HostedCheckoutResponseDto }),
    ApiForbiddenResponse({ description: 'Papel ou origem sem acesso.' }),
    apiHostedCheckoutNotFound,
    apiHostedCheckoutUnavailable,
  );
}
