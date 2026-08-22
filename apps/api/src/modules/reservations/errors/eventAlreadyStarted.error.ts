import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class EventAlreadyStartedError extends ApplicationError {
  public constructor() {
    super('Esta ocorrência já começou', HttpStatus.CONFLICT, 'EVENT_ALREADY_STARTED');
  }
}
