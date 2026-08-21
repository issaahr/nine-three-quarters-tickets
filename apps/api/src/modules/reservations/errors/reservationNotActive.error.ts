import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class ReservationNotActiveError extends ApplicationError {
  public constructor() {
    super('Reservation não está ativa', HttpStatus.CONFLICT, 'RESERVATION_NOT_ACTIVE');
  }
}
