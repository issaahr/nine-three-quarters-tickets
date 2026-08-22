import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Reservation } from '../reservations/reservation.entity';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentStatus } from './paymentStatus.enum';

/** Tentativa idempotente de pagamento vinculada a uma Reservation. */
@Entity('payments')
@Unique('paymentsReservationIdempotencyKeyUnique', ['reservationId', 'idempotencyKey'])
@Index('paymentsActiveReservationUnique', ['reservationId'], {
  unique: true,
  where: `"status" IN ('${PaymentStatus.Pending}', '${PaymentStatus.Approved}')`,
})
@Check('paymentsAmountCentsNonNegative', '"amountCents" >= 0')
@Check(
  'paymentsLifecycleConsistent',
  `("status" = '${PaymentStatus.Approved}' AND "approvedAt" IS NOT NULL AND "failedAt" IS NULL) OR
   ("status" = '${PaymentStatus.Failed}' AND "approvedAt" IS NULL AND "failedAt" IS NOT NULL) OR
   ("status" IN ('${PaymentStatus.Pending}', '${PaymentStatus.Declined}') AND "approvedAt" IS NULL AND "failedAt" IS NULL)`,
)
export class Payment extends BaseEntity {
  @Column({ type: 'uuid' })
  public reservationId!: string;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'paymentMethodEnum' })
  public method!: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, enumName: 'paymentStatusEnum' })
  public status!: PaymentStatus;

  @Column({ type: 'uuid' })
  public idempotencyKey!: string;

  // Valor obtido dos snapshots dos ReservationItems, nunca de dados do cliente
  @Column({ type: 'integer' })
  public amountCents!: number;

  @Column({ type: 'timestamptz', nullable: true })
  public approvedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  public failedAt!: Date | null;

  // Relations
  @ManyToOne(() => Reservation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reservationId', foreignKeyConstraintName: 'paymentsReservationForeignKey' })
  public reservation!: Relation<Reservation>;
}
