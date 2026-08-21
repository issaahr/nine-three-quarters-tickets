import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class CatalogUnavailableError extends ApplicationError {
  public constructor(cause?: unknown) {
    super('Catálogo externo indisponível', HttpStatus.BAD_GATEWAY, 'CATALOG_UNAVAILABLE', cause);
  }
}
