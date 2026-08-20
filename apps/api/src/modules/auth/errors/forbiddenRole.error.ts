import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../../errors/application.error';

export class ForbiddenRoleError extends ApplicationError {
  public constructor() {
    super('Acesso não permitido', HttpStatus.FORBIDDEN, 'FORBIDDEN_ROLE');
  }
}
