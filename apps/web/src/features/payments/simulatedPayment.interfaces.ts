import type { UseQueryResult } from '@tanstack/react-query';

import type { CardPaymentFormValues } from './schemas';
import type { Payment, SimulatedPixPayment } from './types';

export interface SimulatedCardPaymentFlow {
  submit(data: CardPaymentFormValues): Promise<Payment | undefined>;
  payment: Payment | undefined;
  error: Error | null;
  isPaying: boolean;
}

export interface SimulatedPixPaymentFlow {
  create(): Promise<void>;
  payment: SimulatedPixPayment | null | undefined;
  creationError: Error | null;
  queryError: Error | null;
  isChecking: boolean;
  isRefreshing: boolean;
  isCreating: boolean;
  refresh: UseQueryResult<SimulatedPixPayment | null>['refetch'];
}
