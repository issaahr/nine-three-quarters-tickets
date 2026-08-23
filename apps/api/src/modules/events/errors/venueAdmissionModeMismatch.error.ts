import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class VenueAdmissionModeMismatchError extends ApplicationError {
  public constructor() {
    super(
      'O Venue selecionado não aceita a modalidade de admissão do Event',
      HttpStatus.CONFLICT,
      'VENUE_ADMISSION_MODE_MISMATCH',
    );
  }
}
