import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';

import { applicationConfig } from '../../../config/applicationConfig';
import { ApplicationError } from '../../../errors/application.error';
import { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  /**
   * Exige uma origem explicitamente permitida para mutações autenticadas por cookie.
   * A verificação ocorre no servidor porque CORS sozinho não bloqueia o envio de formulários.
   *
   * @param context - Contexto HTTP da requisição que solicita a mutação.
   * @returns true se Origin corresponde exatamente a uma das origens configuradas.
   */
  public canActivate(context: ExecutionContext): boolean {
    const { origin } = context.switchToHttp().getRequest<AuthenticatedRequest>().headers;

    if (typeof origin !== 'string' || !applicationConfig.corsOrigins.includes(origin)) {
      throw this.createOriginNotAllowedError();
    }

    return true;
  }

  protected createOriginNotAllowedError(): ApplicationError {
    return new ApplicationError(
      'Origem não autorizada para esta operação',
      HttpStatus.FORBIDDEN,
      'ORIGIN_NOT_ALLOWED',
    );
  }
}
