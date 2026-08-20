import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { jwtStrategyName } from '../auth.constants';
import { AuthenticatedUser } from '../auth.types';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard(jwtStrategyName) {
  /** Converte token ausente ou inválido em sessão anônima somente para consultas opcionais. */
  public handleRequest<TUser = AuthenticatedUser>(
    _error: unknown,
    user: TUser | false | null | undefined,
  ): TUser | null {
    return user || null;
  }
}
