import { CanActivate, Inject, Injectable } from '@nestjs/common';

import { publicSignupEnabledToken } from '../auth.constants';
import { PublicSignupUnavailableError } from '../errors/publicSignupUnavailable.error';

@Injectable()
export class PublicSignupGuard implements CanActivate {
  public constructor(
    @Inject(publicSignupEnabledToken) private readonly publicSignupEnabled: boolean,
  ) {}

  /** Mantém a API como autoridade mesmo quando o frontend oculta o fluxo de cadastro. */
  public canActivate(): boolean {
    if (!this.publicSignupEnabled) {
      throw new PublicSignupUnavailableError();
    }

    return true;
  }
}
