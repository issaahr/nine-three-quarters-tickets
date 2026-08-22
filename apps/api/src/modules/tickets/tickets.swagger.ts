import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { CheckInResponseDto } from './dto/checkInResponse.dto';
import { SharedTicketResponseDto, TicketPurchaseResponseDto } from './dto/ticketResponse.dto';

/** Documenta a consulta autenticada de Tickets agrupados por compra. */
export function ApiListTickets() {
  return applyDecorators(
    ApiOperation({ summary: 'Lista os Tickets confirmados do CUSTOMER autenticado' }),
    ApiOkResponse({ type: TicketPurchaseResponseDto, isArray: true }),
  );
}

/** Documenta a apresentação pública de um Ticket por credencial compartilhável. */
export function ApiGetSharedTicket() {
  return applyDecorators(
    ApiOperation({
      summary: 'Consulta o Ticket individual correspondente a uma credencial válida',
    }),
    ApiOkResponse({ type: SharedTicketResponseDto }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Credencial inválida ou Ticket inexistente.',
    }),
  );
}

/**
 * Documenta o resultado operacional da leitura de uma credencial QR pela portaria.
 */
export function ApiCheckInTicket() {
  return applyDecorators(
    ApiOperation({ summary: 'Valida uma credencial QR no Event ativo da portaria' }),
    ApiOkResponse({ type: CheckInResponseDto }),
    ApiBadRequestResponse({
      type: ApplicationErrorResponseDto,
      description: 'Identificador do Event ou corpo da requisição inválido.',
    }),
  );
}

/**
 * Documenta o resultado operacional da digitação de um código manual pela portaria. \
 */
export function ApiCheckInManualCode() {
  return applyDecorators(
    ApiOperation({ summary: 'Valida um código manual no Event ativo da portaria' }),
    ApiOkResponse({ type: CheckInResponseDto }),
    ApiBadRequestResponse({
      type: ApplicationErrorResponseDto,
      description: 'Identificador do Event ou corpo da requisição inválido.',
    }),
  );
}
