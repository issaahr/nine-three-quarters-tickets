import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from '../../App';
import { UserRole } from '../auth/types';
import { AdmissionMode, EventCategory, EventStatus } from '../events/types';
import { server } from '../../test/server';

const apiUrl = 'http://api.test';
const reservationId = 'reservation-checkout';
const eventId = 'event-checkout';
const eventDetail = {
  id: eventId,
  title: 'Sessão reservada',
  description: null,
  genres: ['Drama'],
  category: EventCategory.Movie,
  admissionMode: AdmissionMode.Seated,
  status: EventStatus.Published,
  isPast: false,
  startsAt: '2030-08-25T22:30:00.000Z',
  priceCents: 2590,
  venueName: 'Cine Imperial',
  venueCity: 'Fortaleza',
  venueTimeZone: 'America/Fortaleza',
};
const reservationItems = [
  { id: 'item-1', eventSeatId: 'event-seat-1', unitPriceCents: 2590 },
  { id: 'item-2', eventSeatId: 'event-seat-2', unitPriceCents: 2590 },
];

function renderCheckout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(['auth', 'session'], {
    id: 'customer-1',
    role: UserRole.Customer,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/customer/reservations/${reservationId}`]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server.use(
    http.get(`${apiUrl}/events/${eventId}`, () => HttpResponse.json(eventDetail)),
    http.get(`${apiUrl}/events/${eventId}/seats`, () =>
      HttpResponse.json([
        { id: 'event-seat-1', label: 'A1', row: 'A', number: 1, x: 0, y: 0, status: 'HELD' },
        { id: 'event-seat-2', label: 'A2', row: 'A', number: 2, x: 1, y: 0, status: 'HELD' },
      ]),
    ),
  );
});

describe('checkout de Reservation', () => {
  it('apresenta countdown, itens e snapshot total de uma Reservation ACTIVE', async () => {
    server.use(
      http.get(`${apiUrl}/reservations/${reservationId}`, () =>
        HttpResponse.json({
          id: reservationId,
          eventId,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          confirmedAt: null,
          cancelledAt: null,
          items: reservationItems,
        }),
      ),
    );

    renderCheckout();

    expect(
      await screen.findByRole('heading', { name: 'Sua reserva está em andamento' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Tempo restante da reserva' })).toBeInTheDocument();
    expect(await screen.findByText('Sessão reservada')).toBeInTheDocument();
    expect(await screen.findByText('A1')).toBeInTheDocument();
    expect(screen.getByText('A2')).toBeInTheDocument();
    expect(screen.getByText('R$ 51,80')).toBeInTheDocument();
  });

  it('informa expiração autoritativa e permite retornar explicitamente à seleção', async () => {
    server.use(
      http.get(`${apiUrl}/reservations/${reservationId}`, () =>
        HttpResponse.json({
          id: reservationId,
          eventId,
          status: 'EXPIRED',
          expiresAt: '2020-01-01T00:10:00.000Z',
          confirmedAt: null,
          cancelledAt: null,
          items: reservationItems,
        }),
      ),
    );

    renderCheckout();

    expect(await screen.findByRole('heading', { name: 'Sua reserva expirou' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'O prazo terminou e estes assentos não estão mais reservados para você.',
    );
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à seleção' })).toHaveAttribute(
      'href',
      `/events/${eventId}`,
    );
  });
});
