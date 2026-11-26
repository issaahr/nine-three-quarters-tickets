import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class PaymentNotFoundError extends ApplicationError {
  public constructor() {
    super('Pagamento não encontrado', HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND');
  }
}
