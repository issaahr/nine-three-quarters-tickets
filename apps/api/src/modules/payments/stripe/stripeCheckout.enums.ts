export enum StripeCheckoutObject {
  Session = 'checkout.session',
  PaymentIntent = 'payment_intent',
}

export enum StripeCheckoutMode {
  Payment = 'payment',
}

export enum StripeCheckoutSessionStatus {
  Open = 'open',
  Complete = 'complete',
  Expired = 'expired',
}

export enum StripeCheckoutPaymentStatus {
  Unpaid = 'unpaid',
  Paid = 'paid',
}

export enum StripePaymentIntentStatus {
  RequiresPaymentMethod = 'requires_payment_method',
  Succeeded = 'succeeded',
  Canceled = 'canceled',
}

export enum StripePaymentMethod {
  Card = 'card',
  Pix = 'pix',
}

export enum StripeCheckoutEventType {
  Completed = 'checkout.session.completed',
  AsyncPaymentSucceeded = 'checkout.session.async_payment_succeeded',
  AsyncPaymentFailed = 'checkout.session.async_payment_failed',
  Expired = 'checkout.session.expired',
}
