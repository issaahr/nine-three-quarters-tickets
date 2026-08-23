import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class GeneralAdmissionCapacityUnavailableError extends ApplicationError {
  public constructor() {
    super(
      'A quantidade solicitada excede a disponibilidade do Event',
      HttpStatus.CONFLICT,
      'GENERAL_ADMISSION_CAPACITY_UNAVAILABLE',
    );
  }
}
