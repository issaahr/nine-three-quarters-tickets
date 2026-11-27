import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class HostedCheckoutUnavailableError extends ApplicationError {
  public constructor() {
    super(
      'Checkout temporariamente indisponível. Retome a mesma tentativa.',
      HttpStatus.SERVICE_UNAVAILABLE,
      'HOSTED_CHECKOUT_UNAVAILABLE',
    );
  }
}
