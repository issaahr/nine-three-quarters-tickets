import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class ReservationAlreadyPaidError extends ApplicationError {
  public constructor() {
    super(
      'Esta Reservation já possui pagamento aprovado',
      HttpStatus.CONFLICT,
      'RESERVATION_ALREADY_PAID',
    );
  }
}
