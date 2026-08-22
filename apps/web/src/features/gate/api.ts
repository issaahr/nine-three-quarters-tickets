import { api } from '../../lib/api';

import { GateEvent } from './types';

export async function fetchGateEvents(): Promise<GateEvent[]> {
  const response = await api.get<GateEvent[]>('/gate/events');
  return response.data;
}
