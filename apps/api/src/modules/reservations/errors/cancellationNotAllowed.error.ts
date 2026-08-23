import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class CancellationNotAllowedError extends ApplicationError {
  public constructor() {
    super(
      'Esta compra não pode mais ser cancelada.',
      HttpStatus.CONFLICT,
      'CANCELLATION_NOT_ALLOWED',
    );
  }
}
