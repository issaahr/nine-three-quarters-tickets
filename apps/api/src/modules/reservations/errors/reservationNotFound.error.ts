import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class ReservationNotFoundError extends ApplicationError {
  public constructor() {
    super('Reservation não encontrada', HttpStatus.NOT_FOUND, 'RESERVATION_NOT_FOUND');
  }
}
