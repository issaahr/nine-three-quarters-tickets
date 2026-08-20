import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../hooks';
import { SessionLoading } from './SessionLoading';

/** Protege a navegação como recurso de UX; a autorização efetiva continua pertencendo à API. */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading, sessionError } = useAuth();

  if (isLoading) {
    return <SessionLoading />;
  }

  if (sessionError) {
    return <main>Não foi possível consultar sua sessão. Tente novamente em instantes.</main>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
