import { Request } from 'express';

import { UserRole } from '../users/userRole.enum';

export interface AccessTokenPayload {
  // `sub` é a claim padrão que identifica o usuário representado pelo token.
  sub: string;
  role: UserRole;
}

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Omit<Request, 'user'> {
  user: AuthenticatedUser;
}

export interface OptionalAuthenticatedRequest extends Omit<Request, 'user'> {
  user?: AuthenticatedUser | null;
}

export interface AuthenticatedSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}
