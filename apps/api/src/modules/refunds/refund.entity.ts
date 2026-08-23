import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Payment } from '../payments/payment.entity';
import { RefundStatus } from './refundStatus.enum';

/**
 * Devolução integral posterior a um pagamento aprovado, preservando seu histórico.
 */
@Entity('refunds')
@Index('refundsActivePaymentUnique', ['paymentId'], {
  unique: true,
  where: `"status" IN ('${RefundStatus.Pending}', '${RefundStatus.Completed}')`,
})
@Check('refundsAmountCentsPositive', '"amountCents" > 0')
@Check(
  'refundsLifecycleConsistent',
  `("status" = '${RefundStatus.Completed}' AND "completedAt" IS NOT NULL AND "failedAt" IS NULL) OR
   ("status" = '${RefundStatus.Failed}' AND "completedAt" IS NULL AND "failedAt" IS NOT NULL) OR
   ("status" = '${RefundStatus.Pending}' AND "completedAt" IS NULL AND "failedAt" IS NULL)`,
)
export class Refund extends BaseEntity {
  @Column({ type: 'uuid' })
  public paymentId!: string;

  @Column({ type: 'integer' })
  public amountCents!: number;

  @Column({ type: 'enum', enum: RefundStatus, enumName: 'refundStatusEnum' })
  public status!: RefundStatus;

  @Column({ type: 'timestamptz', nullable: true })
  public completedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  public failedAt!: Date | null;

  // Relations
  @ManyToOne(() => Payment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId', foreignKeyConstraintName: 'refundsPaymentForeignKey' })
  public payment!: Relation<Payment>;
}
