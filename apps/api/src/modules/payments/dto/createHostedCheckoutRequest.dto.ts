import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { PaymentMethod } from '../paymentMethod.enum';

export class CreateHostedCheckoutRequestDto {
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod)
  public method!: PaymentMethod;
}
