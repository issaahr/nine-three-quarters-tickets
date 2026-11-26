import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { PaymentCheckoutConfigurationResponseDto } from './dto/paymentCheckoutConfigurationResponse.dto';
import { HostedPaymentGateway } from './hostedPaymentGateway.interfaces';
import { PaymentCheckoutMode } from './paymentCheckoutMode.enum';
import { checkoutPaymentMethods, hostedPaymentGatewayToken } from './payments.constants';
import { ApiGetPaymentCheckoutConfiguration } from './payments.swagger';

@ApiTags('Payments')
@Controller('payments/configuration')
@Roles(UserRole.Customer)
export class PaymentCheckoutConfigurationController {
  public constructor(
    @Inject(hostedPaymentGatewayToken) private readonly gateway: HostedPaymentGateway | null,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiGetPaymentCheckoutConfiguration()
  public find() {
    return {
      mode: this.gateway ? PaymentCheckoutMode.Hosted : PaymentCheckoutMode.Simulated,
      methods: checkoutPaymentMethods,
    } satisfies PaymentCheckoutConfigurationResponseDto;
  }
}
