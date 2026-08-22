import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { App } from '../../App';
import { UserRole } from '../auth/types';
import { AdmissionMode, EventCategory } from '../events/types';
import { server } from '../../test/server';
import { TicketStatus } from './types';

const apiUrl = 'http://api.test';

function renderTickets() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(['auth', 'session'], {
    id: 'customer-1',
    role: UserRole.Customer,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/customer/tickets']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderSharedTicket(credential: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/tickets/shared/${credential}`]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Meus ingressos', () => {
  it('agrupa os Tickets por compra e mantém cada credencial como item independente', async () => {
    server.use(
      http.get(`${apiUrl}/tickets`, () =>
        HttpResponse.json([
          {
            reservationId: 'reservation-1',
            confirmedAt: '2030-08-01T12:00:00.000Z',
            event: {
              id: 'event-1',
              title: 'Sessão de cinema',
              category: EventCategory.Movie,
              admissionMode: AdmissionMode.Seated,
              startsAt: '2030-08-25T22:30:00.000Z',
              venueName: 'Cine Imperial',
              venueCity: 'Fortaleza',
              venueTimeZone: 'America/Fortaleza',
            },
            tickets: [
              {
                publicId: 'ticket-1',
                credential: 'v1.ticket-1.signature',
                manualCode: 'ABCD-EFGH',
                status: TicketStatus.Valid,
                issuedAt: '2030-08-01T12:00:00.000Z',
                seatLabel: 'B2',
              },
              {
                publicId: 'ticket-2',
                credential: 'v1.ticket-2.signature',
                manualCode: 'JKLM-NPQR',
                status: TicketStatus.Used,
                issuedAt: '2030-08-01T12:00:00.000Z',
                seatLabel: 'B3',
              },
            ],
          },
          {
            reservationId: 'reservation-2',
            confirmedAt: '2030-08-02T12:00:00.000Z',
            event: {
              id: 'event-2',
              title: 'Show ao vivo',
              category: EventCategory.Show,
              admissionMode: AdmissionMode.GeneralAdmission,
              startsAt: '2030-09-01T22:30:00.000Z',
              venueName: 'Teatro Margem',
              venueCity: 'Recife',
              venueTimeZone: 'America/Recife',
            },
            tickets: [
              {
                publicId: 'ticket-3',
                credential: 'v1.ticket-3.signature',
                manualCode: 'STUV-WXYZ',
                status: TicketStatus.Cancelled,
                issuedAt: '2030-08-02T12:00:00.000Z',
                seatLabel: null,
              },
            ],
          },
        ]),
      ),
    );

    renderTickets();

    expect(await screen.findByRole('heading', { name: 'Meus ingressos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sessão de cinema' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Show ao vivo' })).toBeInTheDocument();
    expect(screen.getByText('Assento B2')).toBeInTheDocument();
    expect(screen.getByText('Assento B3')).toBeInTheDocument();
    expect(screen.getByText('Entrada geral')).toBeInTheDocument();
    expect(screen.getByText('ABCD-EFGH')).toBeInTheDocument();
    expect(screen.getByText('JKLM-NPQR')).toBeInTheDocument();
    expect(screen.getByText('STUV-WXYZ')).toBeInTheDocument();
    expect(screen.getByText('Válido')).toBeInTheDocument();
    expect(screen.getByText('Utilizado')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Assento B2/ })).toHaveAttribute(
      'href',
      '/customer/tickets/v1.ticket-1.signature',
    );
  });

  it('explica quando o cliente ainda não possui compras confirmadas', async () => {
    server.use(http.get(`${apiUrl}/tickets`, () => HttpResponse.json([])));

    renderTickets();

    expect(
      await screen.findByRole('heading', { name: 'Nenhum ingresso emitido' }),
    ).toBeInTheDocument();
  });

  it('informa uma falha de consulta sem tratar a listagem como estado local autoritativo', async () => {
    server.use(http.get(`${apiUrl}/tickets`, () => new HttpResponse(null, { status: 500 })));

    renderTickets();

    expect(
      await screen.findByRole('heading', { name: 'Não foi possível carregar seus ingressos' }),
    ).toBeInTheDocument();
  });

  it('apresenta pelo link público um único Ticket com QR da credencial e estado atual', async () => {
    const credential = 'v1.ticket-4.signature';
    server.use(
      http.get(`${apiUrl}/tickets/shared/${credential}`, () =>
        HttpResponse.json({
          publicId: 'ticket-4',
          credential,
          manualCode: 'ABCD-EFGH',
          status: TicketStatus.Used,
          issuedAt: '2030-08-01T12:00:00.000Z',
          seatLabel: 'C1',
          event: {
            id: 'event-4',
            title: 'Sessão compartilhada',
            category: EventCategory.Movie,
            admissionMode: AdmissionMode.Seated,
            startsAt: '2030-08-25T22:30:00.000Z',
            venueName: 'Cine Imperial',
            venueCity: 'Fortaleza',
            venueTimeZone: 'America/Fortaleza',
          },
        }),
      ),
    );

    renderSharedTicket(credential);

    expect(
      await screen.findByRole('heading', { name: 'Sessão compartilhada' }),
    ).toBeInTheDocument();
    expect(screen.getByText('C1')).toBeInTheDocument();
    expect(screen.getByText('Utilizado')).toBeInTheDocument();
    expect(screen.getByLabelText('Código QR do ingresso')).toBeInTheDocument();
    expect(screen.getByText('O seguinte ingresso foi compartilhado com você')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compartilhar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver eventos' })).not.toBeInTheDocument();
  });
});
