import { CanActivate, Injectable } from '@nestjs/common';

import { applicationConfig } from '../../../config/applicationConfig';
import { PaymentNotFoundError } from '../errors/paymentNotFound.error';
import { PaymentProvider } from '../paymentProvider.enum';

@Injectable()
export class FakePaymentsModeGuard implements CanActivate {
  public canActivate(): boolean {
    if (applicationConfig.payments.provider !== PaymentProvider.Fake)
      throw new PaymentNotFoundError();
    return true;
  }
}
