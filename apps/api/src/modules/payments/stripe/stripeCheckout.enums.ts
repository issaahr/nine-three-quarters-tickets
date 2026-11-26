export enum StripeCheckoutObject {
  Session = 'checkout.session',
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
}

export enum StripePaymentMethod {
  Card = 'card',
  Pix = 'pix',
}
