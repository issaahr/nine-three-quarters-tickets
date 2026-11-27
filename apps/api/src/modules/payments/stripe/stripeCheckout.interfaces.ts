import { StripeCheckoutSessionStatus } from './stripeCheckout.enums';

export interface StripeCheckoutSession {
  id: string;
  status: StripeCheckoutSessionStatus;
  paymentStatus: unknown;
  paymentIntent: unknown;
  url: unknown;
}

export interface StripeCheckoutNotification {
  paymentId: string;
  externalReference: string;
}
