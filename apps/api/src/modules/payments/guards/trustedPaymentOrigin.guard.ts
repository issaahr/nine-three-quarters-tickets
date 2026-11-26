import { HttpStatus, Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';
import { TrustedOriginGuard } from '../../auth/guards/trustedOrigin.guard';

/** Preserva o código de erro público do settlement ao compartilhar a validação de origem. */
@Injectable()
export class TrustedPaymentOriginGuard extends TrustedOriginGuard {
  protected override createOriginNotAllowedError(): ApplicationError {
    return new ApplicationError(
      'Origem não autorizada para concluir o pagamento',
      HttpStatus.FORBIDDEN,
      'PAYMENT_ORIGIN_NOT_ALLOWED',
    );
  }
}
