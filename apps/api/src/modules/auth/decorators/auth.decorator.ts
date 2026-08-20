import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { applicationConfig } from '../../../config/applicationConfig';
import { ApplicationErrorResponseDto } from '../../../errors/applicationErrorResponse.dto';
import { JwtAuthGuard } from '../guards/jwtAuth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Protege o endpoint e documenta o cookie exigido sem repetir decorators no controller.
 */
export function Auth() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiCookieAuth(applicationConfig.auth.cookie.name),
    ApiUnauthorizedResponse({
      type: ApplicationErrorResponseDto,
      description: 'Token ausente, inválido ou expirado.',
    }),
  );
}
