import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class ReservationExpiredError extends ApplicationError {
  public constructor() {
    super('O prazo desta Reservation expirou', HttpStatus.CONFLICT, 'RESERVATION_EXPIRED');
  }
}
