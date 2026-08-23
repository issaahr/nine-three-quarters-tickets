import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { RateLimitExceededError } from './rateLimit.error';

@Injectable()
export class ApplicationRateLimitGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new RateLimitExceededError();
  }
}
