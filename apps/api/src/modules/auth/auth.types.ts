import { UserRole } from '../users/userRole.enum';

export interface AccessTokenPayload {
  // `sub` é a claim padrão que identifica o usuário representado pelo token.
  sub: string;
  role: UserRole;
}

export interface AuthenticatedSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}
