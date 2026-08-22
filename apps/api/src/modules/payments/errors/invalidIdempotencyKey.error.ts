import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class InvalidIdempotencyKeyError extends ApplicationError {
  public constructor() {
    super(
      'Idempotency-Key deve ser um UUID v4 válido',
      HttpStatus.BAD_REQUEST,
      'INVALID_IDEMPOTENCY_KEY',
    );
  }
}
