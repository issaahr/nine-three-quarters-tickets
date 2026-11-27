import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { PaymentNotFoundError } from '../errors/paymentNotFound.error';
import { HostedPaymentReconciliationService } from '../hostedPaymentReconciliation.service';
import { stripeCheckoutWebhookToken } from '../payments.constants';
import { ApiStripeCheckoutWebhook } from '../payments.swagger';
import { stripeWebhookSignatureHeader } from './stripeCheckout.constants';
import { StripeCheckoutWebhook } from './stripeCheckoutWebhook';

@ApiTags('Payments')
@Controller('payments/webhooks/stripe')
export class StripeCheckoutWebhookController {
  public constructor(
    @Inject(stripeCheckoutWebhookToken) private readonly webhook: StripeCheckoutWebhook | null,
    private readonly reconciliation: HostedPaymentReconciliationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiStripeCheckoutWebhook()
  public async receive(@Req() request: RawBodyRequest<Request>) {
    if (!this.webhook) throw new PaymentNotFoundError();
    const notification = this.webhook.parse(
      request.rawBody,
      request.headers[stripeWebhookSignatureHeader],
    );
    if (notification) {
      await this.reconciliation.reconcileNotification(
        notification.paymentId,
        notification.externalReference,
      );
    }
  }
}
