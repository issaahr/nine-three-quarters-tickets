import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class AuthenticationRequiredError extends ApplicationError {
  public constructor() {
    super('Autenticação necessária', HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_REQUIRED');
  }
}
