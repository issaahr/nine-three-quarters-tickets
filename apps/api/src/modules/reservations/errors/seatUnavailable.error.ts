import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class SeatUnavailableError extends ApplicationError {
  public constructor() {
    super('Um ou mais assentos não estão disponíveis', HttpStatus.CONFLICT, 'SEAT_UNAVAILABLE');
  }
}
