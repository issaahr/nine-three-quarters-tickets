import { api } from '../../lib/api';
import { EventDetail, EventDiscoveryFilters, EventDiscoveryPage, EventSeatMapItem } from './types';

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

/**
 * Carrega uma ocorrência diretamente do snapshot persistido pela API.
 *
 * @param eventId - Identificador da ocorrência escolhida no catálogo.
 * @returns Conteúdo público e estado temporal calculado pelo backend.
 */
export async function fetchEventDetail(eventId: string): Promise<EventDetail> {
  const response = await api.get<EventDetail>(`/events/${eventId}`);
  return response.data;
}

/**
 * Carrega o layout seated e a disponibilidade calculada pela API para uma ocorrência pública.
 */
export async function fetchEventSeatMap(eventId: string): Promise<EventSeatMapItem[]> {
  const response = await api.get<EventSeatMapItem[]>(`/events/${eventId}/seats`);
  return response.data;
}
