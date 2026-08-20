import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class InvalidCredentialsError extends ApplicationError {
  public constructor() {
    super('Credenciais inválidas', HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS');
  }
}
