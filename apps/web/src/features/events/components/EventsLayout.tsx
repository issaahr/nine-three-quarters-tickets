import { LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '../../auth/hooks';
import { UserRole } from '../../auth/types';
import {
  SiteHeader,
  SiteHeaderNavLink,
  siteHeaderActionClassName,
} from '../../navigation/components/SiteHeader';
import { getRoleNavigation } from '../../navigation/roleNavigation';

/** Mantém o catálogo público disponível enquanto a sessão opcional é restaurada em segundo plano. */
export function EventsLayout() {
  const navigate = useNavigate();
  const { user, isLoading, logout, isLoggingOut, logoutError } = useAuth();
  const navigation = user ? getRoleNavigation(user.role) : undefined;
  const areaPath = navigation?.homePath ?? '/events';
  const hasDedicatedArea = areaPath !== '/events';

  async function handleLogout(): Promise<void> {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      // A falha é anunciada sem retirar o catálogo público da tela.
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader brandPath="/events" brandLabel="9¾ Tickets — catálogo de eventos">
        {user && user.role !== UserRole.Customer && (
          <span className="hidden text-[10px] font-medium uppercase tracking-[1.5px] text-border sm:inline">
            {navigation?.label}
          </span>
        )}
        {user && (
          <nav aria-label="Navegação principal" className="flex items-center">
            <SiteHeaderNavLink
              to={areaPath}
              end
              className={hasDedicatedArea ? undefined : 'hidden sm:inline-flex'}
            >
              {hasDedicatedArea ? navigation?.homeLabel : 'Eventos'}
            </SiteHeaderNavLink>
            {user.role === UserRole.Customer && (
              <SiteHeaderNavLink to="/customer/tickets">Meus ingressos</SiteHeaderNavLink>
            )}
          </nav>
        )}

        {user === null && !isLoading && (
          <NavLink
            to="/demo"
            className={cn(
              siteHeaderActionClassName,
              'border-secondary bg-secondary font-semibold text-secondary-foreground hover:bg-primary-foreground hover:text-secondary-foreground',
            )}
          >
            Experimentar
          </NavLink>
        )}

        {user ? (
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
        ) : isLoading ? (
          <span
            className="block h-9 w-16 animate-pulse rounded-[4px] bg-border"
            aria-hidden="true"
          />
        ) : (
          <NavLink to="/login" className={siteHeaderActionClassName}>
            Entrar
          </NavLink>
        )}
      </SiteHeader>

      {logoutError && (
        <div
          role="alert"
          className="bg-destructive/10 px-4 py-2 text-center text-[13px] text-destructive"
        >
          Não foi possível encerrar a sessão. Tente novamente.
        </div>
      )}

      <Outlet />
    </div>
  );
}
