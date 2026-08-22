/**
 * Estados persistidos de uma tentativa de pagamento.
 */
export enum PaymentStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Declined = 'DECLINED',
  Failed = 'FAILED',
}
