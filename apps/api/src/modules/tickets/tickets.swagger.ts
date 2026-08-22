import { applyDecorators } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
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
