import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class ActiveReservationExistsError extends ApplicationError {
  public constructor() {
    super(
      'Já existe uma reserva ativa para esta ocorrência',
      HttpStatus.CONFLICT,
      'ACTIVE_RESERVATION_EXISTS',
    );
  }
}
