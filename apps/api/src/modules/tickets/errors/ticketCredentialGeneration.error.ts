import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

/** Indica que o banco recusou repetidamente credenciais aleatórias de um Ticket. */
export class TicketCredentialGenerationError extends ApplicationError {
  public constructor() {
    super(
      'Não foi possível gerar uma credencial única para o Ticket',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'TICKET_CREDENTIAL_GENERATION_FAILED',
    );
  }
}
