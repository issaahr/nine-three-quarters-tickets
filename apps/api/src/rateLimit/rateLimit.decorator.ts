import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { ApplicationErrorResponseDto } from '../errors/applicationErrorResponse.dto';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { UserRole } from '../modules/users/userRole.enum';
import { ApplicationRateLimitGuard } from './applicationRateLimit.guard';
import { RateLimitPolicy } from './rateLimitPolicy.enum';

const policies = Object.values(RateLimitPolicy);

/** Aplica somente a política informada e documenta o contrato público de excesso. */
export function RateLimit(policy: RateLimitPolicy) {
  const skippedPolicies = Object.fromEntries(
    policies.map((candidate) => [candidate, candidate !== policy]),
  );

  return applyDecorators(
    SkipThrottle(skippedPolicies),
    UseGuards(ApplicationRateLimitGuard),
    ApiTooManyRequestsResponse({
      type: ApplicationErrorResponseDto,
      description: 'Limite de solicitações excedido para a janela configurada.',
    }),
  );
}

/** Garante autenticação e autorização antes de calcular o bucket autenticado. */
export function RateLimitedRoles(policy: RateLimitPolicy, ...roles: UserRole[]) {
  return applyDecorators(Roles(...roles), RateLimit(policy));
}
