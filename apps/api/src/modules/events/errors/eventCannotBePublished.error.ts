import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class EventCannotBePublishedError extends ApplicationError {
  public constructor() {
    super(
      'O estado atual do Event não permite publicação',
      HttpStatus.CONFLICT,
      'EVENT_CANNOT_BE_PUBLISHED',
    );
  }
}
