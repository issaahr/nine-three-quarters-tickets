import { LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/button';
import { useAuth } from '../../auth/hooks';
import { UserRole } from '../../auth/types';
import { BrandLink } from '../../navigation/components/BrandLink';
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
      <header className="bg-secondary-foreground">
        <div className="flex min-h-[68px] w-full flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3 sm:px-6 lg:px-12 2xl:px-16">
          <BrandLink to="/events" ariaLabel="9¾ Tickets — catálogo de eventos" />

          <div className="flex items-center gap-2 sm:gap-5">
            {user && user.role !== UserRole.Customer && (
              <span className="hidden text-[10px] font-medium uppercase tracking-[1.5px] text-border sm:inline">
                {navigation?.label}
              </span>
            )}
            <nav aria-label="Navegação principal">
              {user && (
                <NavLink
                  to={hasDedicatedArea ? areaPath : '/events'}
                  end
                  className={({ isActive }) =>
                    `rounded-[4px] px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${!hasDedicatedArea ? 'hidden sm:inline-block ' : ''}${
                      isActive
                        ? 'text-primary-foreground'
                        : 'text-surface-dark-subtle hover:text-primary-foreground'
                    }`
                  }
                >
                  {hasDedicatedArea ? navigation?.homeLabel : 'Eventos'}
                </NavLink>
              )}
              {user?.role === UserRole.Customer && (
                <NavLink
                  to="/customer/tickets"
                  className={({ isActive }) =>
                    `rounded-[4px] px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                      isActive
                        ? 'text-primary-foreground'
                        : 'text-surface-dark-subtle hover:text-primary-foreground'
                    }`
                  }
                >
                  Meus ingressos
                </NavLink>
              )}
            </nav>

            {user ? (
              <Button
                type="button"
                variant="outline"
                disabled={isLoggingOut}
                onClick={() => void handleLogout()}
                className="h-8 rounded-[4px] border-brass-border bg-transparent px-3 text-[12px] text-primary-foreground hover:bg-surface-dark-border hover:text-primary-foreground"
              >
                <LogOut aria-hidden="true" />
                <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
              </Button>
            ) : isLoading ? (
              <span className="block h-6 w-16 animate-pulse rounded-[4px] bg-border" />
            ) : (
              <NavLink
                to="/login"
                className="rounded-[4px] border border-brass-border px-3 py-2 text-[12px] text-primary-foreground transition-colors hover:bg-surface-dark-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                Entrar
              </NavLink>
            )}
          </div>
        </div>
      </header>

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
