import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { CreateReservationResponseDto } from './dto/createReservationResponse.dto';

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
