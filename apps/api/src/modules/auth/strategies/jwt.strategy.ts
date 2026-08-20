import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { isUUID } from 'class-validator';
import { ExtractJwt, Strategy as PassportJwtStrategy } from 'passport-jwt';

import { applicationConfig } from '../../../config/applicationConfig';
import { UserRole } from '../../users/userRole.enum';
import { jwtStrategyName } from '../auth.constants';
import { AccessTokenPayload, AuthenticatedUser } from '../auth.types';
import { AuthenticationRequiredError } from '../errors/authenticationRequired.error';

// O access token é aceito exclusivamente no cookie HttpOnly configurado pela aplicação.
function extractJwtFromCookie(request: Request): string | null {
  const token: unknown = request.cookies?.[applicationConfig.auth.cookie.name];

  return typeof token === 'string' ? token : null;
}

// Rejeita payloads assinados que não representem uma identidade válida da aplicação.
function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<AccessTokenPayload>;

  return (
    typeof candidate.sub === 'string' &&
    isUUID(candidate.sub) &&
    typeof candidate.role === 'string' &&
    Object.values(UserRole).includes(candidate.role as UserRole)
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(PassportJwtStrategy, jwtStrategyName) {
  public constructor() {
    super({
      algorithms: ['HS256'],
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromExtractors([extractJwtFromCookie]),
      secretOrKey: applicationConfig.auth.jwtSecret,
    });
  }

  /**
   * Valida as claims controladas pela aplicação depois que o Passport verifica
   * assinatura e expiração, sem consultar o banco em toda requisição.
   */
  public validate(payload: unknown): AuthenticatedUser {
    if (!isAccessTokenPayload(payload)) {
      throw new AuthenticationRequiredError();
    }

    return {
      id: payload.sub,
      role: payload.role,
    };
  }
}
