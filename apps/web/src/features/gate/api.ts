import { api } from '@/lib/api';

import { CheckInResponse, GateEvent } from './types';

export async function fetchGateEvents(): Promise<GateEvent[]> {
  const response = await api.get<GateEvent[]>('/gate/events');
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
