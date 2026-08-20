import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class EmailAlreadyRegisteredError extends ApplicationError {
  public constructor(cause?: unknown) {
    super('Email já cadastrado', HttpStatus.CONFLICT, 'EMAIL_ALREADY_REGISTERED', cause);
  }
}
