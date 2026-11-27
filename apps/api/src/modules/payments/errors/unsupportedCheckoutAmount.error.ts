import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class UnsupportedCheckoutAmountError extends ApplicationError {
  public constructor() {
    super(
      'O total da reserva está fora dos limites do método de pagamento escolhido',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'PAYMENT_AMOUNT_UNSUPPORTED',
    );
  }
}
