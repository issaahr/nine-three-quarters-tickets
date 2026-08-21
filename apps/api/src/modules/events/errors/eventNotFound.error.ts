import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class EventNotFoundError extends ApplicationError {
  public constructor() {
    super('Event não encontrado', HttpStatus.NOT_FOUND, 'EVENT_NOT_FOUND');
  }
}
