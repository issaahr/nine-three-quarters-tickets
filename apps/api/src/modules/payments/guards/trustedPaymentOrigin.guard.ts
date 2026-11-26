import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';

import { applicationConfig } from '../../../config/applicationConfig';
import { ApplicationError } from '../../../errors/application.error';
import { AuthenticatedRequest } from '../../auth/auth.types';

@Injectable()
export class TrustedPaymentOriginGuard implements CanActivate {
  /**
   * Exige uma origem explícita nas mutações protegidas por cookie, inclusive para clientes de teste.
   * CORS controla o acesso à resposta e, sozinho, não impede o envio de um formulário de outra origem.
   *
   * @param context - Contexto HTTP da requisição que solicita o settlement.
   * @returns true quando Origin corresponde exatamente a uma origem configurada.
   */
  public canActivate(context: ExecutionContext): boolean {
    const { origin } = context.switchToHttp().getRequest<AuthenticatedRequest>().headers;

    if (typeof origin !== 'string' || !applicationConfig.corsOrigins.includes(origin)) {
      throw new ApplicationError(
        'Origem não autorizada para concluir o pagamento',
        HttpStatus.FORBIDDEN,
        'PAYMENT_ORIGIN_NOT_ALLOWED',
      );
    }

    return true;
  }
}
