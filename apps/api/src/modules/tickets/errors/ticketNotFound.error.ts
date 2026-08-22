import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

/** Mantém credencial inválida e Ticket inexistente indistinguíveis no acesso compartilhado. */
export class TicketNotFoundError extends ApplicationError {
  public constructor() {
    super('Ticket não encontrado', HttpStatus.NOT_FOUND, 'TICKET_NOT_FOUND');
  }
}
