import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class VenueHasNoSeatsError extends ApplicationError {
  public constructor() {
    super(
      'O Venue selecionado não possui assentos configurados',
      HttpStatus.CONFLICT,
      'VENUE_HAS_NO_SEATS',
    );
  }
}
