export interface GateEvent {
  id: string;
  title: string;
  venueName: string;
  venueTimeZone: string;
  startsAt: string;
}

export interface GateEventsFilters {
  page?: number;
  today?: boolean;
}

export interface GateEventsPage {
  items: GateEvent[];
  page: number;
  hasMore: boolean;
}

export enum CheckInResult {
  Valid = 'VALID',
  Invalid = 'INVALID',
  AlreadyUsed = 'ALREADY_USED',
  EventMismatch = 'EVENT_MISMATCH',
  Cancelled = 'CANCELLED',
}

export interface CheckInResponse {
  result: CheckInResult;
}
