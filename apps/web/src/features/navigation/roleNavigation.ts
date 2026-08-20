import { UserRole } from '../auth/types';

interface RoleNavigation {
  label: string;
  homePath: string;
  homeLabel: string;
  operational: boolean;
}

/** Mantém destino e nomenclatura de cada papel alinhados entre rotas e navbar. */
const navigationByRole = {
  [UserRole.Customer]: {
    label: 'Cliente',
    homePath: '/customer',
    homeLabel: 'Eventos',
    operational: false,
  },
  [UserRole.Organizer]: {
    label: 'Organizador',
    homePath: '/organizer',
    homeLabel: 'Meus eventos',
    operational: false,
  },
  [UserRole.Gate]: {
    label: 'Portaria',
    homePath: '/gate',
    homeLabel: 'Portaria',
    operational: true,
  },
} satisfies Record<UserRole, RoleNavigation>;

export function getRoleNavigation(role: UserRole): RoleNavigation {
  return navigationByRole[role];
}
