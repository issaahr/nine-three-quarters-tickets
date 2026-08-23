import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../errors/application.error';

export class RateLimitExceededError extends ApplicationError {
  public constructor() {
    super(
      'Muitas solicitações. Aguarde antes de tentar novamente.',
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMIT_EXCEEDED',
    );
  }
}
