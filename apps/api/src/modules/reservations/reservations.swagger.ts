import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiOkResponse,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { CreateReservationResponseDto } from './dto/createReservationResponse.dto';
import { ReservationDetailResponseDto } from './dto/reservationDetailResponse.dto';

/** Agrupa a documentação HTTP da aquisição atômica de assentos em uma Reservation. */
export function ApiCreateReservation() {
  return applyDecorators(
    ApiOperation({ summary: 'Cria uma Reservation seated com hold temporário de assentos' }),
    ApiCreatedResponse({
      type: CreateReservationResponseDto,
      description:
        'Reservation criada somente quando todos os assentos foram adquiridos no mesmo commit.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Payload inválido, incluindo EventSeat.id ausente, repetido ou inválido.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Event inexistente.',
    }),
    ApiConflictResponse({
      type: ApplicationErrorResponseDto,
      description:
        'Assento indisponível, Reservation ativa existente, Event não elegível ou ocorrência já iniciada.',
    }),
  );
}

/**
 * Agrupa a documentação da consulta da Reservation ativa do CUSTOMER em um Event.
 */
export function ApiGetActiveReservation() {
  return applyDecorators(
    ApiOperation({ summary: 'Consulta a Reservation ativa do CUSTOMER em uma ocorrência' }),
    ApiOkResponse({ type: ReservationDetailResponseDto }),
    ApiNoContentResponse({ description: 'Não existe Reservation ativa para o Event informado.' }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Event.id inválido.',
    }),
  );
}

/**
 * Agrupa a documentação da leitura autorizada de uma Reservation.
 */
export function ApiGetReservation() {
  return applyDecorators(
    ApiOperation({ summary: 'Consulta uma Reservation do CUSTOMER autenticado' }),
    ApiOkResponse({ type: ReservationDetailResponseDto }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Reservation inexistente ou não pertencente ao CUSTOMER.',
    }),
  );
}

/**
 * Agrupa a documentação do cancelamento transacional de uma Reservation.
 */
export function ApiCancelReservation() {
  return applyDecorators(
    ApiOperation({ summary: 'Cancela uma Reservation ativa e libera seus EventSeats' }),
    ApiOkResponse({ type: ReservationDetailResponseDto }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Reservation inexistente ou não pertencente ao CUSTOMER.',
    }),
    ApiConflictResponse({
      type: ApplicationErrorResponseDto,
      description: 'Reservation já expirada, confirmada ou cancelada.',
    }),
  );
}
