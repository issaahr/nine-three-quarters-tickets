import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class InvalidStripeWebhookError extends ApplicationError {
  public constructor() {
    super('Notificação Stripe inválida', HttpStatus.BAD_REQUEST, 'INVALID_STRIPE_WEBHOOK');
  }
}
