import { ApiProperty } from '@nestjs/swagger';

import { SimulatedPixPaymentInitiation } from '../payments.interfaces';
import { PaymentResponseDto } from './paymentResponse.dto';

/** Contrato HTTP usado para retomar e acompanhar o PIX simulado no checkout. */
export class SimulatedPixPaymentResponseDto extends PaymentResponseDto {
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public simulationCompletionAt!: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Conteúdo não pagável do QR simulado.',
  })
  public qrCodePayload!: string | null;

  /**
   * Expõe o prazo persistido e o conteúdo do QR usando os campos públicos do Payment.
   *
   * @param result - Tentativa recuperada ou criada pelo serviço, com o QR quando o método é PIX.
   * @returns Resposta com prazo e QR nulos quando a chave idempotente reutiliza uma tentativa de cartão.
   */
  public static fromSimulatedPixPayment(
    result: SimulatedPixPaymentInitiation,
  ): SimulatedPixPaymentResponseDto {
    return {
      ...PaymentResponseDto.fromPayment(result.payment),
      simulationCompletionAt: result.payment.simulationCompletionAt,
      qrCodePayload: result.qrCodePayload,
    };
  }
}
