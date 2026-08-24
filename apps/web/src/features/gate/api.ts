import { api } from '@/lib/api';

import { CheckInResponse, GateEvent, GateEventsFilters, GateEventsPage } from './types';

export async function fetchGateEvents(filters?: GateEventsFilters): Promise<GateEventsPage> {
  const response = await api.get<GateEventsPage>('/gate/events', {
    params: {
      page: filters?.page,
      today: filters?.today ? 'true' : undefined,
    },
  });
  return response.data;
}

export async function fetchGateEvent(eventId: string): Promise<GateEvent> {
  const response = await api.get<GateEvent>(`/gate/events/${encodeURIComponent(eventId)}`);
  return response.data;
}

export async function checkInCredential(
  eventId: string,
  credential: string,
): Promise<CheckInResponse> {
  const response = await api.post<CheckInResponse>(`/gate/events/${eventId}/check-in`, {
    credential,
  });
  return response.data;
}

export async function checkInManualCode(
  eventId: string,
  manualCode: string,
): Promise<CheckInResponse> {
  const response = await api.post<CheckInResponse>(`/gate/events/${eventId}/check-in/manual-code`, {
    manualCode,
  });
  return response.data;
}
