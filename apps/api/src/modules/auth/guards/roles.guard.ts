import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../../users/userRole.enum';
import { rolesMetadataKey } from '../auth.constants';
import { OptionalAuthenticatedRequest } from '../auth.types';
import { AuthenticationRequiredError } from '../errors/authenticationRequired.error';
import { ForbiddenRoleError } from '../errors/forbiddenRole.error';

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(rolesMetadataKey, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<OptionalAuthenticatedRequest>();

    if (!request.user) {
      throw new AuthenticationRequiredError();
    }

    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenRoleError();
    }

    return true;
  }
}
