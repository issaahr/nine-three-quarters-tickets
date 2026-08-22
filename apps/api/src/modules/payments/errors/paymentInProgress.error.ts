import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class PaymentInProgressError extends ApplicationError {
  public constructor() {
    super(
      'Já existe um pagamento em andamento para esta Reservation',
      HttpStatus.CONFLICT,
      'PAYMENT_IN_PROGRESS',
    );
  }
}
