import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../../errors/applicationErrorResponse.dto';
import { UserRole } from '../../users/userRole.enum';
import { rolesMetadataKey } from '../auth.constants';
import { Auth } from './auth.decorator';

/**
 * Restringe o endpoint a uma das roles informadas e inclui autenticação para que
 * a metadata de autorização nunca seja aplicada isoladamente.
 */
export function Roles(...roles: UserRole[]) {
  return applyDecorators(
    Auth(),
    SetMetadata(rolesMetadataKey, roles),
    ApiForbiddenResponse({
      type: ApplicationErrorResponseDto,
      description: 'Usuário autenticado não possui permissão para acessar este recurso.',
    }),
  );
}
