/**
 * Estados persistidos de um Refund. Estornos externos aguardam confirmação do provedor.
 */
export enum RefundStatus {
  Pending = 'PENDING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}
