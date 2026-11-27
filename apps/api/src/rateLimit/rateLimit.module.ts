import { Global, Module } from '@nestjs/common';
import { seconds, ThrottlerModule } from '@nestjs/throttler';

import { applicationConfig } from '../config/applicationConfig';
import { ApplicationRateLimitGuard } from './applicationRateLimit.guard';
import { RateLimitPolicy } from './rateLimitPolicy.enum';
import {
  generateRateLimitKey,
  trackAuthRequest,
  trackCatalogRequest,
  trackHostedCheckoutRequest,
  trackManualCheckInRequest,
} from './rateLimit.trackers';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: RateLimitPolicy.Auth,
        ttl: seconds(applicationConfig.rateLimit.auth.windowSeconds),
        limit: applicationConfig.rateLimit.auth.maxRequests,
        getTracker: trackAuthRequest,
        generateKey: generateRateLimitKey,
      },
      {
        name: RateLimitPolicy.Catalog,
        ttl: seconds(applicationConfig.rateLimit.catalog.windowSeconds),
        limit: applicationConfig.rateLimit.catalog.maxRequests,
        getTracker: trackCatalogRequest,
        generateKey: generateRateLimitKey,
      },
      {
        name: RateLimitPolicy.ManualCheckIn,
        ttl: seconds(applicationConfig.rateLimit.manualCheckIn.windowSeconds),
        limit: applicationConfig.rateLimit.manualCheckIn.maxRequests,
        getTracker: trackManualCheckInRequest,
        generateKey: generateRateLimitKey,
      },
      {
        name: RateLimitPolicy.HostedCheckout,
        ttl: seconds(applicationConfig.rateLimit.hostedCheckout.windowSeconds),
        limit: applicationConfig.rateLimit.hostedCheckout.maxRequests,
        getTracker: trackHostedCheckoutRequest,
        generateKey: generateRateLimitKey,
      },
    ]),
  ],
  providers: [ApplicationRateLimitGuard],
  exports: [ApplicationRateLimitGuard],
})
export class RateLimitModule {}
