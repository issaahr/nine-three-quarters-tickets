import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class EventCannotBeReservedError extends ApplicationError {
  public constructor() {
    super(
      'O estado atual do Event não permite novas reservas',
      HttpStatus.CONFLICT,
      'EVENT_CANNOT_BE_RESERVED',
    );
  }
}
