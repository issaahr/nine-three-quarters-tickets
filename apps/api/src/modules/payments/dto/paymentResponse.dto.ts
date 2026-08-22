import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Payment } from '../payment.entity';
import { PaymentMethod } from '../paymentMethod.enum';
import { PaymentStatus } from '../paymentStatus.enum';

/**
 * Contrato público de uma tentativa de pagamento, sem dados de cartão.
 */
export class PaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public reservationId!: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  public method!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  public status!: PaymentStatus;

  @ApiProperty({ minimum: 0 })
  public amountCents!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public approvedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public failedAt!: Date | null;

  public static fromPayment(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      reservationId: payment.reservationId,
      method: payment.method,
      status: payment.status,
      amountCents: payment.amountCents,
      approvedAt: payment.approvedAt,
      failedAt: payment.failedAt,
    };
  }
}
