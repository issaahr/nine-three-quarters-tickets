import { UserRole } from '../auth/types';
import { RoleNavigation } from './navigation.interfaces';

/** Mantém destino e nomenclatura de cada papel alinhados entre rotas e navbar. */
const navigationByRole = {
  [UserRole.Customer]: {
    label: 'Cliente',
    homePath: '/events',
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
