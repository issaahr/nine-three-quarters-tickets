import { LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/button';
import { useAuth } from '../../auth/hooks';
import { UserRole } from '../../auth/types';
import { getRoleNavigation } from '../roleNavigation';
import { BrandLink } from './BrandLink';

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
          ? 'min-h-screen bg-[#1A0A0D] text-[#F5F2EC]'
          : 'min-h-screen bg-background text-foreground'
      }
    >
      <header
        className={
          navigation.operational
            ? 'border-b border-[#3A1A20] bg-[#0D0507]'
            : 'bg-secondary-foreground'
        }
      >
        <div className="flex min-h-[68px] w-full flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3 sm:px-6 lg:px-12 2xl:px-16">
          <BrandLink
            to={navigation.homePath}
            ariaLabel={`9¾ Tickets — início da área de ${navigation.label.toLowerCase()}`}
          />

          <div className="flex items-center gap-2 sm:gap-5">
            {user.role !== UserRole.Customer && (
              <span className="hidden text-[10px] font-medium uppercase tracking-[1.5px] text-[#8A857C] sm:inline">
                {navigation.label}
              </span>
            )}
            <nav aria-label="Navegação principal">
              {user.role === UserRole.Customer && (
                <NavLink
                  to={navigation.homePath}
                  end
                  className={({ isActive }) =>
                    `hidden rounded-[4px] px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:inline-block ${
                      isActive
                        ? 'text-primary-foreground'
                        : 'text-[#C9BBA6] hover:text-primary-foreground'
                    }`
                  }
                >
                  {navigation.homeLabel}
                </NavLink>
              )}
              {user.role === UserRole.Customer && (
                <NavLink
                  to="/customer/tickets"
                  className={({ isActive }) =>
                    `rounded-[4px] px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
                      isActive
                        ? 'text-primary-foreground'
                        : 'text-[#C9BBA6] hover:text-primary-foreground'
                    }`
                  }
                >
                  Meus ingressos
                </NavLink>
              )}
            </nav>
            <Button
              type="button"
              variant="outline"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              className="h-8 rounded-[4px] border-[#6B5636] bg-transparent px-3 text-[12px] text-primary-foreground hover:bg-[#3A1A20] hover:text-primary-foreground"
            >
              <LogOut aria-hidden="true" />
              <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
            </Button>
          </div>
        </div>
      </header>

      {logoutError && (
        <div
          role="alert"
          className={
            navigation.operational
              ? 'border-b border-[#3A1A20] bg-[#2B0A10] px-4 py-2 text-center text-[13px] text-[#D99999]'
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
