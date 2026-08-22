import { TicketStatus } from './types';

const ticketStatusLabel: Record<TicketStatus, string> = {
  [TicketStatus.Valid]: 'Válido',
  [TicketStatus.Used]: 'Utilizado',
  [TicketStatus.Cancelled]: 'Cancelado',
};

export function getTicketStatusLabel(status: TicketStatus): string {
  return ticketStatusLabel[status];
}

export function getTicketLocationLabel(seatLabel: string | null): string {
  return seatLabel ? `Assento ${seatLabel}` : 'Entrada geral';
}
