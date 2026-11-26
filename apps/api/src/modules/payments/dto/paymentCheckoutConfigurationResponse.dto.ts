import { ApiProperty } from '@nestjs/swagger';

import { PaymentCheckoutMode } from '../paymentCheckoutMode.enum';
import { PaymentMethod } from '../paymentMethod.enum';

export class PaymentCheckoutConfigurationResponseDto {
  @ApiProperty({ enum: PaymentCheckoutMode, enumName: 'PaymentCheckoutMode' })
  public mode!: PaymentCheckoutMode;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod', isArray: true })
  public methods!: readonly PaymentMethod[];
}
