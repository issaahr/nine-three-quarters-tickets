import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../auth/hooks';
import { UserRole } from '../../auth/types';
import { getRoleNavigation } from '../roleNavigation';

interface RoleRouteProps {
  allowedRole: UserRole;
}

/**
 * Impede navegação acidental entre áreas no frontend. A autorização efetiva
 * das operações continua obrigatoriamente nos guards da API.
 */
export function RoleRoute({ allowedRole }: RoleRouteProps) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (user.role !== allowedRole) {
    return <Navigate to={getRoleNavigation(user.role).homePath} replace />;
  }

  return <Outlet />;
}
