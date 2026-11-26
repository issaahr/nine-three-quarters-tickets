import { PaymentProvider } from '../modules/payments/paymentProvider.enum';
import { NodeEnv } from './nodeEnv.enum';

export type PaymentProviderConfig =
  | { provider: PaymentProvider.Fake }
  | { provider: PaymentProvider.Stripe; secretKey: string; webhookSecret: string };

interface RateLimitConfiguration {
  windowSeconds: number;
  maxRequests: number;
}

/** Configuração HTTP validada e compartilhada pelos módulos da API. */
export interface ApplicationConfig {
  environment: NodeEnv;
  port: number;
  corsOrigins: string[];
  publicSignupEnabled: boolean;
  proxy: { trustedHops: number };
  rateLimit: {
    auth: RateLimitConfiguration;
    catalog: RateLimitConfiguration;
    manualCheckIn: RateLimitConfiguration;
    hostedCheckout: RateLimitConfiguration;
  };
  reservations: { holdDurationSeconds: number };
  payments: PaymentProviderConfig & { cardPendingTimeoutSeconds: number };
  catalog: {
    tmdb: { accessToken: string; language: string; requestTimeoutMs: number; posterSize: string };
    ticketmaster: { apiKey: string; locale: string; requestTimeoutMs: number };
  };
  auth: {
    jwtSecret: string;
    jwtExpiresInSeconds: number;
    cookie: {
      name: string;
      httpOnly: boolean;
      path: string;
      sameSite: 'lax' | 'none';
      secure: boolean;
    };
  };
  tickets: { hmacSecret: string };
}
