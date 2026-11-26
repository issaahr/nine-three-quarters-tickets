import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Reservation } from '../reservations/reservation.entity';
import { PaymentCurrency } from './paymentCurrency.enum';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentProvider } from './paymentProvider.enum';
import { PaymentStatus } from './paymentStatus.enum';

/** Tentativa idempotente de pagamento vinculada a uma Reservation. */
@Entity('payments')
@Unique('paymentsReservationIdempotencyKeyUnique', ['reservationId', 'idempotencyKey'])
@Unique('paymentsProviderExternalReferenceUnique', ['provider', 'externalReference'])
@Unique('paymentsProviderExternalPaymentReferenceUnique', ['provider', 'externalPaymentReference'])
@Index('paymentsActiveReservationUnique', ['reservationId'], {
  unique: true,
  where: `"status" IN ('${PaymentStatus.Pending}', '${PaymentStatus.Approved}')`,
})
@Index('paymentsPendingHostedReconciliationIndex', ['provider', 'id'], {
  where: `"status" = '${PaymentStatus.Pending}' AND "externalReference" IS NOT NULL`,
})
@Index('paymentsPendingUnlinkedReconciliationIndex', ['provider', 'id'], {
  where: `"status" = '${PaymentStatus.Pending}' AND "externalReference" IS NULL`,
})
@Check('paymentsAmountCentsNonNegative', '"amountCents" >= 0')
@Check(
  'paymentsCheckoutReturnUrlMatchesProvider',
  `"checkoutReturnUrl" IS NULL OR ("provider" <> '${PaymentProvider.Fake}' AND btrim("checkoutReturnUrl") <> '')`,
)
@Check(
  'paymentsExternalPaymentReferenceMatchesOutcome',
  `"externalPaymentReference" IS NULL OR ("provider" <> '${PaymentProvider.Fake}' AND "externalReference" IS NOT NULL AND btrim("externalPaymentReference") <> '' AND "status" IN ('${PaymentStatus.Approved}', '${PaymentStatus.Failed}'))`,
)
@Check(
  'paymentsSimulationCompletionMatchesProviderAndMethod',
  `("provider" = '${PaymentProvider.Fake}' AND "method" = '${PaymentMethod.Pix}') = ("simulationCompletionAt" IS NOT NULL)`,
)
@Check(
  'paymentsExternalReferenceMatchesProvider',
  `"externalReference" IS NULL OR ("provider" <> '${PaymentProvider.Fake}' AND btrim("externalReference") <> '')`,
)
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

  @Column({ type: 'enum', enum: PaymentProvider, enumName: 'paymentProviderEnum' })
  public provider!: PaymentProvider;

  @Column({ type: 'enum', enum: PaymentStatus, enumName: 'paymentStatusEnum' })
  public status!: PaymentStatus;

  @Column({ type: 'uuid' })
  public idempotencyKey!: string;

  // Valor obtido dos snapshots dos ReservationItems, nunca de dados do cliente
  @Column({ type: 'integer' })
  public amountCents!: number;

  @Column({ type: 'enum', enum: PaymentCurrency, enumName: 'paymentCurrencyEnum' })
  public currency!: PaymentCurrency;

  @Column({ type: 'text', nullable: true })
  public externalReference!: string | null;

  // O endereço usado na primeira criação precisa permanecer igual durante um retry idempotente.
  @Column({ type: 'text', nullable: true })
  public checkoutReturnUrl!: string | null;

  // Evidência de cobrança confirmada pelo provedor, mesmo quando a compra local falha.
  @Column({ type: 'text', nullable: true })
  public externalPaymentReference!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  public approvedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  public failedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  public simulationCompletionAt!: Date | null;

  // Relations
  @ManyToOne(() => Reservation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reservationId', foreignKeyConstraintName: 'paymentsReservationForeignKey' })
  public reservation!: Relation<Reservation>;
}
