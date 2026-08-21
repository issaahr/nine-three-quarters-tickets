import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class EventMustStartInFutureError extends ApplicationError {
  public constructor() {
    super(
      'Data e horário do evento devem estar no futuro',
      HttpStatus.BAD_REQUEST,
      'EVENT_MUST_START_IN_FUTURE',
    );
  }
}
