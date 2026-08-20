import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { jwtStrategyName } from '../auth.constants';
import { AuthenticatedUser } from '../auth.types';
import { AuthenticationRequiredError } from '../errors/authenticationRequired.error';

@Injectable()
export class JwtAuthGuard extends AuthGuard(jwtStrategyName) {
  // Mantém a mesma resposta para token ausente, inválido, adulterado ou expirado.
  public handleRequest<TUser = AuthenticatedUser>(
    error: unknown,
    user: TUser | false | null | undefined,
  ): TUser {
    if (error || !user) {
      throw new AuthenticationRequiredError();
    }

    return user;
  }
}
