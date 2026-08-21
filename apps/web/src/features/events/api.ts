import { api } from '../../lib/api';
import { EventDiscoveryFilters, EventDiscoveryPage } from './types';

/**
 * Carrega uma página pública de ocorrências usando filtros já normalizados pela interface.
 *
 * @param filters - Restrições aplicadas ao catálogo.
 * @param page - Página solicitada pelo carregamento infinito.
 * @returns Events futuros publicados e indicação de continuidade.
 */
export async function fetchEventDiscovery(
  filters: EventDiscoveryFilters,
  page: number,
): Promise<EventDiscoveryPage> {
  const response = await api.get<EventDiscoveryPage>('/events', {
    params: { ...filters, page },
  });

  return response.data;
}
