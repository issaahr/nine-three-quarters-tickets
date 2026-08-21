import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class InvalidEventDiscoveryPeriodError extends ApplicationError {
  public constructor() {
    super(
      'Data inicial não pode ser posterior à data final',
      HttpStatus.BAD_REQUEST,
      'INVALID_EVENT_DISCOVERY_PERIOD',
    );
  }
}
