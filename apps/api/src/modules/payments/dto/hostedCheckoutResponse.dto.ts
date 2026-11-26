import { ApiProperty } from '@nestjs/swagger';

import { PaymentCurrency } from '../paymentCurrency.enum';
import { HostedCheckout } from '../payments.interfaces';
import { PaymentResponseDto } from './paymentResponse.dto';

export class HostedCheckoutResponseDto extends PaymentResponseDto {
  @ApiProperty({ enum: PaymentCurrency, enumName: 'PaymentCurrency' })
  public currency!: PaymentCurrency;

  @ApiProperty({ type: String, format: 'uri', nullable: true })
  public checkoutUrl!: string | null;

  @ApiProperty({
    description: 'A tentativa local aceita retomada explícita para concluir a criação da sessão.',
  })
  public canResume!: boolean;

  /**
   * Projeta o estado local e o link público sem expor o identificador interno da sessão no provedor.
   *
   * @returns Resposta com URL nula enquanto indisponível, inclusive para compras gratuitas.
   */
  public static fromCheckout({
    payment,
    checkoutUrl,
    canResume,
  }: HostedCheckout): HostedCheckoutResponseDto {
    return {
      ...PaymentResponseDto.fromPayment(payment),
      currency: payment.currency,
      checkoutUrl,
      canResume,
    };
  }
}
