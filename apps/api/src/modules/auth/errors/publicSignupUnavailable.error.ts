import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class PublicSignupUnavailableError extends ApplicationError {
  public constructor() {
    super('Cadastro público indisponível', HttpStatus.NOT_FOUND, 'PUBLIC_SIGNUP_UNAVAILABLE');
  }
}
