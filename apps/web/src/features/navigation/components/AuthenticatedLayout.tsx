import { LogOut } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '../../auth/hooks';
import { UserRole } from '../../auth/types';
import { getRoleNavigation } from '../roleNavigation';
import { SiteHeader, SiteHeaderNavLink, siteHeaderActionClassName } from './SiteHeader';

export function AuthenticatedLayout() {
  const navigate = useNavigate();
  const { user, logout, isLoggingOut, logoutError } = useAuth();

  if (!user) {
    return null;
  }

  const navigation = getRoleNavigation(user.role);

  /** Encerra a sessão e evita que a rota protegida permaneça no histórico ativo. */
  async function handleLogout(): Promise<void> {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      // O erro da mutation é anunciado no próprio layout.
    }
  }

  return (
    <div
      className={
        navigation.operational
          ? 'min-h-screen bg-surface-dark text-background'
          : 'min-h-screen bg-background text-foreground'
      }
    >
      <SiteHeader
        operational={navigation.operational}
        brandPath={navigation.homePath}
        brandLabel={`9¾ Tickets — início da área de ${navigation.label.toLowerCase()}`}
      >
        {user.role !== UserRole.Customer && (
          <span className="hidden text-[10px] font-medium uppercase tracking-[1.5px] text-border sm:inline">
            {navigation.label}
          </span>
        )}
        {user.role === UserRole.Customer && (
          <nav aria-label="Navegação principal" className="flex items-center">
            <SiteHeaderNavLink to={navigation.homePath} end className="hidden sm:inline-flex">
              {navigation.homeLabel}
            </SiteHeaderNavLink>
            <SiteHeaderNavLink to="/customer/tickets">Meus ingressos</SiteHeaderNavLink>
          </nav>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={isLoggingOut}
          onClick={() => void handleLogout()}
          className={siteHeaderActionClassName}
        >
          <LogOut aria-hidden="true" />
          <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
        </Button>
      </SiteHeader>

      {logoutError && (
        <div
          role="alert"
          className={
            navigation.operational
              ? 'border-b border-surface-dark-border bg-secondary-foreground px-4 py-2 text-center text-[13px] text-destructive-soft'
              : 'bg-destructive/10 px-4 py-2 text-center text-[13px] text-destructive'
          }
        >
          Não foi possível encerrar a sessão. Tente novamente.
        </div>
      )}

      <Outlet />
    </div>
  );
}
