import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class CatalogTimeoutError extends ApplicationError {
  public constructor(cause?: unknown) {
    super(
      'Catálogo externo excedeu o tempo de resposta',
      HttpStatus.GATEWAY_TIMEOUT,
      'CATALOG_TIMEOUT',
      cause,
    );
  }
}
