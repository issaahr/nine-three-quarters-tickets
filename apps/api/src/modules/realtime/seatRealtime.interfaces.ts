export interface EventRoomJoined {
  eventId: string;
}

export interface SeatRealtimeDelta {
  eventId: string;
  eventSeatIds: string[];
}
