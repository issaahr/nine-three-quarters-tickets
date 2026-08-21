import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class CatalogItemNotFoundError extends ApplicationError {
  public constructor() {
    super('Filme não encontrado no catálogo', HttpStatus.NOT_FOUND, 'CATALOG_ITEM_NOT_FOUND');
  }
}
