import { EventSeatStatus } from '../eventSeatStatus.enum';

export interface PublicEventSeatMapItem {
  id: string;
  label: string;
  row: string;
  number: number;
  x: number;
  y: number;
  status: EventSeatStatus;
}
