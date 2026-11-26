import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { PaymentMethod } from '../paymentMethod.enum';
import { checkoutPaymentMethods } from '../payments.constants';

export class CreateHostedCheckoutRequestDto {
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsIn(checkoutPaymentMethods)
  public method!: PaymentMethod;
}
