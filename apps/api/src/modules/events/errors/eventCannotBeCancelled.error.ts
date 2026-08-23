import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class EventCannotBeCancelledError extends ApplicationError {
  public constructor() {
    super('Este evento não pode ser cancelado.', HttpStatus.CONFLICT, 'EVENT_CANNOT_BE_CANCELLED');
  }
}
