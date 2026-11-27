import type { UseQueryResult } from '@tanstack/react-query';

import type { HostedCheckoutPayment, PaymentMethod } from './types';

/** Estado da tentativa consultado pela página e a ação explícita que pode iniciar ou retomar pagamento. */
export interface HostedCheckoutFlow {
  payment: HostedCheckoutPayment | null | undefined;
  paymentQuery: UseQueryResult<HostedCheckoutPayment | null>;
  isSubmitting: boolean;
  submissionError: Error | null;
  unsupportedAmountMethod?: PaymentMethod;
  uncertainMethod?: PaymentMethod;
  submit(
    method: PaymentMethod,
    resumePaymentId?: string,
  ): Promise<HostedCheckoutPayment | undefined>;
}
