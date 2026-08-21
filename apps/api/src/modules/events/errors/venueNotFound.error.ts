import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class VenueNotFoundError extends ApplicationError {
  public constructor() {
    super('Venue não encontrado', HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND');
  }
}
