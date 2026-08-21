import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class InvalidEventStartError extends ApplicationError {
  public constructor(cause?: unknown) {
    super(
      'Data e horário local inválidos ou ambíguos para o Venue',
      HttpStatus.BAD_REQUEST,
      'INVALID_EVENT_START',
      cause,
    );
  }
}
