import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class InvalidVenueTimeZoneError extends ApplicationError {
  public constructor(cause?: unknown) {
    super(
      'Timezone inválido na configuração do Venue',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INVALID_VENUE_TIME_ZONE',
      cause,
    );
  }
}
