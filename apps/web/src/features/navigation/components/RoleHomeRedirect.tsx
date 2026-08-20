import { Navigate } from 'react-router-dom';

import { useAuth } from '../../auth/hooks';
import { getRoleNavigation } from '../roleNavigation';

/** Direciona a entrada autenticada para a área correspondente ao papel da sessão. */
export function RoleHomeRedirect() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return <Navigate to={getRoleNavigation(user.role).homePath} replace />;
}
