import { AuthenticatedUser } from '../modules/auth/auth.types';

export interface RateLimitRequest {
  ip?: string;
  user?: AuthenticatedUser | null;
}
