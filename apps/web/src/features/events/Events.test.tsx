import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import { server } from '../../test/server';
import {
  AdmissionMode,
  EventCategory,
  EventDetail,
  EventDiscoveryItem,
  EventSeatMapItem,
  EventSeatStatus,
  EventStatus,
} from './types';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
  })),
}));

const apiUrl = 'http://api.test';
const event: EventDiscoveryItem = {
  id: 'event-1',
  title: 'A Viagem de Chihiro',
  description: 'Sessão especial',
  imageUrl: 'https://image.test/chihiro.jpg',
  genres: ['Animação', 'Fantasia'],
  category: EventCategory.Movie,
  admissionMode: AdmissionMode.Seated,
  startsAt: '2030-08-25T22:30:00.000Z',
  priceCents: 2590,
  venueName: 'Cine Imperial',
  venueCity: 'Fortaleza',
  venueTimeZone: 'America/Fortaleza',
};

const eventDetail: EventDetail = {
  ...event,
  status: EventStatus.Published,
  isPast: false,
};

const seatMap: EventSeatMapItem[] = [
  {
    id: 'event-seat-1',
    label: 'A1',
    row: 'A',
    number: 1,
    x: 0,
    y: 0,
    status: EventSeatStatus.Available,
  },
  {
    id: 'event-seat-2',
    label: 'A2',
    row: 'A',
    number: 2,
    x: 1,
    y: 0,
    status: EventSeatStatus.Held,
  },
  {
    id: 'event-seat-3',
    label: 'B1',
    row: 'B',
    number: 1,
    x: 0,
    y: 1,
    status: EventSeatStatus.Sold,
  },
];

function renderEvents(initialPath = '/events') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  server.use(
    http.get(`${apiUrl}/auth/session`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${apiUrl}/events`, () =>
      HttpResponse.json({ items: [event], page: 1, hasMore: false }),
    ),
    http.get(`${apiUrl}/events/${event.id}/seats`, () => HttpResponse.json(seatMap)),
  );
});

describe('catálogo público de eventos', () => {
  it('apresenta um Event publicado sem exigir autenticação', async () => {
    renderEvents();

    expect(
      await screen.findByRole('heading', { name: 'Encontre sua próxima experiência' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Ver detalhes de ${event.title}` })).toHaveAttribute(
      'href',
      `/events/${event.id}`,
    );
    expect(screen.getByText('R$ 25,90')).toBeInTheDocument();
    expect(screen.getByText('Cine Imperial · Fortaleza')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
  });

  it('envia somente os filtros aplicados explicitamente', async () => {
    let requestedUrl: URL | undefined;
    server.use(
      http.get(`${apiUrl}/events`, ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json({ items: [], page: 1, hasMore: false });
      }),
    );
    const user = userEvent.setup();
    renderEvents();

    await screen.findByRole('heading', { name: 'Nenhum evento disponível' });
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    await user.type(screen.getByLabelText('Buscar'), '  cinema   clássico  ');
    await user.type(screen.getByLabelText('Cidade'), '  Fortaleza  ');
    await user.type(screen.getByLabelText('A partir de'), '2030-08-01');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(requestedUrl?.searchParams.get('query')).toBe('cinema clássico'));
    expect(requestedUrl?.searchParams.get('city')).toBe('Fortaleza');
    expect(requestedUrl?.searchParams.get('dateFrom')).toBe('2030-08-01');
    expect(requestedUrl?.searchParams.get('page')).toBe('1');
    expect(requestedUrl?.searchParams.has('genre')).toBe(false);
  });

  it('mantém a barra de busca disponível enquanto os filtros avançados estão recolhidos', async () => {
    const user = userEvent.setup();
    renderEvents();

    expect(await screen.findByRole('button', { name: 'Filtros' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByLabelText('Cidade')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filtros' }));

    expect(screen.getByLabelText('Cidade')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ocultar filtros' }));
    expect(screen.queryByLabelText('Cidade')).not.toBeInTheDocument();
  });

  it('diferencia uma busca sem correspondências do catálogo vazio', async () => {
    server.use(
      http.get(`${apiUrl}/events`, () => HttpResponse.json({ items: [], page: 1, hasMore: false })),
    );
    const user = userEvent.setup();
    renderEvents();

    await screen.findByRole('heading', { name: 'Nenhum evento disponível' });
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    await user.type(screen.getByLabelText('Gênero'), 'Jazz');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    expect(
      await screen.findByRole('heading', { name: 'Nenhum evento corresponde aos filtros' }),
    ).toBeInTheDocument();
  });

  it('abre uma única ocorrência com conteúdo local, Venue e preço claros', async () => {
    server.use(http.get(`${apiUrl}/events/${event.id}`, () => HttpResponse.json(eventDetail)));

    renderEvents(`/events/${event.id}`);

    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();
    expect(screen.getByText(event.description!)).toBeInTheDocument();
    expect(screen.getByText(event.venueName)).toBeInTheDocument();
    expect(screen.getByText(event.venueCity)).toBeInTheDocument();
    expect(screen.getByText('R$ 25,90')).toBeInTheDocument();
    expect(screen.getByText('Animação · Fantasia')).toBeInTheDocument();
    expect(screen.queryByText(/não aceita novas compras/i)).not.toBeInTheDocument();
  });

  it('renderiza o mapa por dados e mantém a seleção somente no estado local', async () => {
    const reserveHandler = vi.fn();
    server.use(
      http.get(`${apiUrl}/events/${event.id}`, () => HttpResponse.json(eventDetail)),
      http.post(`${apiUrl}/reservations`, () => {
        reserveHandler();
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();

    renderEvents(`/events/${event.id}`);

    const availableSeat = await screen.findByRole('button', {
      name: 'Assento A1, disponível',
    });
    const heldSeat = screen.getByRole('button', { name: 'Assento A2, indisponível' });
    const soldSeat = screen.getByRole('button', { name: 'Assento B1, indisponível' });

    expect(heldSeat).toBeDisabled();
    expect(soldSeat).toBeDisabled();
    expect(screen.getByText('Selecione seus assentos')).toBeInTheDocument();
    expect(screen.getByText('A seleção ainda não reserva os assentos.')).toBeInTheDocument();

    await user.click(availableSeat);

    expect(availableSeat).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 assento selecionado.')).toBeInTheDocument();
    expect(reserveHandler).not.toHaveBeenCalled();

    await user.click(availableSeat);

    expect(availableSeat).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Selecione seus assentos')).toBeInTheDocument();
  });

  it('cria o hold apenas após confirmação da API e atualiza o mapa de assentos', async () => {
    const reservationHandler = vi.fn();
    const seatMapHandler = vi.fn(() => HttpResponse.json(seatMap));
    const createdReservation = {
      id: 'reservation-1',
      eventId: event.id,
      expiresAt: '2030-08-25T22:40:00.000Z',
      items: [{ id: 'item-1', eventSeatId: 'event-seat-1', unitPriceCents: 2590 }],
    };
    server.use(
      http.get(`${apiUrl}/auth/session`, () =>
        HttpResponse.json({ id: 'customer-1', role: 'CUSTOMER' }),
      ),
      http.get(`${apiUrl}/events/${event.id}`, () => HttpResponse.json(eventDetail)),
      http.get(`${apiUrl}/events/${event.id}/seats`, () => seatMapHandler()),
      http.get(`${apiUrl}/reservations/active`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${apiUrl}/reservations/${createdReservation.id}`, () =>
        HttpResponse.json({
          ...createdReservation,
          status: 'ACTIVE',
          confirmedAt: null,
          cancelledAt: null,
        }),
      ),
      http.post(`${apiUrl}/reservations`, async ({ request }) => {
        reservationHandler(await request.json());
        return HttpResponse.json(createdReservation, { status: 201 });
      }),
    );
    const user = userEvent.setup();

    renderEvents(`/events/${event.id}`);

    await user.click(await screen.findByRole('button', { name: 'Assento A1, disponível' }));
    await user.click(screen.getByRole('button', { name: 'Reservar assentos' }));

    await waitFor(() =>
      expect(reservationHandler).toHaveBeenCalledWith({
        eventId: event.id,
        eventSeatIds: ['event-seat-1'],
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Sua reserva está em andamento' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Tempo restante da reserva' })).toBeInTheDocument();
    await waitFor(() => expect(seatMapHandler.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('abandona a nova seleção e retoma o checkout da Reservation ACTIVE', async () => {
    const activeReservation = {
      id: 'reservation-active',
      eventId: event.id,
      status: 'ACTIVE',
      expiresAt: '2030-08-25T22:40:00.000Z',
      confirmedAt: null,
      cancelledAt: null,
      items: [{ id: 'item-active', eventSeatId: 'event-seat-1', unitPriceCents: 2590 }],
    };
    server.use(
      http.get(`${apiUrl}/auth/session`, () =>
        HttpResponse.json({ id: 'customer-1', role: 'CUSTOMER' }),
      ),
      http.get(`${apiUrl}/events/${event.id}`, () => HttpResponse.json(eventDetail)),
      http.get(`${apiUrl}/reservations/active`, () => HttpResponse.json(activeReservation)),
      http.get(`${apiUrl}/reservations/${activeReservation.id}`, () =>
        HttpResponse.json(activeReservation),
      ),
    );
    const user = userEvent.setup();

    renderEvents(`/events/${event.id}`);

    await user.click(await screen.findByRole('button', { name: 'Assento A1, disponível' }));
    await user.click(screen.getByRole('button', { name: 'Reservar assentos' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Voltar à compra',
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Sua reserva está em andamento' }),
    ).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
  });

  it('informa conflito de assento e busca novamente a disponibilidade autoritativa', async () => {
    const seatMapHandler = vi.fn(() => HttpResponse.json(seatMap));
    server.use(
      http.get(`${apiUrl}/auth/session`, () =>
        HttpResponse.json({ id: 'customer-1', role: 'CUSTOMER' }),
      ),
      http.get(`${apiUrl}/events/${event.id}`, () => HttpResponse.json(eventDetail)),
      http.get(`${apiUrl}/events/${event.id}/seats`, () => seatMapHandler()),
      http.get(`${apiUrl}/reservations/active`, () => new HttpResponse(null, { status: 204 })),
      http.post(`${apiUrl}/reservations`, () =>
        HttpResponse.json({ code: 'SEAT_UNAVAILABLE' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();

    renderEvents(`/events/${event.id}`);

    await user.click(await screen.findByRole('button', { name: 'Assento A1, disponível' }));
    await user.click(screen.getByRole('button', { name: 'Reservar assentos' }));

    expect(
      await screen.findByText('Um ou mais assentos ficaram indisponíveis. Revise a seleção.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(seatMapHandler.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('pede confirmação antes de cancelar a Reservation ACTIVE do CUSTOMER', async () => {
    const activeReservation = {
      id: 'reservation-1',
      eventId: event.id,
      status: 'ACTIVE',
      expiresAt: '2030-08-25T22:40:00.000Z',
      confirmedAt: null,
      cancelledAt: null,
      items: [{ id: 'item-1', eventSeatId: 'event-seat-1', unitPriceCents: 2590 }],
    };
    const cancelHandler = vi.fn();
    server.use(
      http.get(`${apiUrl}/auth/session`, () =>
        HttpResponse.json({ id: 'customer-1', role: 'CUSTOMER' }),
      ),
      http.get(`${apiUrl}/events/${event.id}`, () => HttpResponse.json(eventDetail)),
      http.get(`${apiUrl}/reservations/active`, () => HttpResponse.json(activeReservation)),
      http.post(`${apiUrl}/reservations/${activeReservation.id}/cancel`, () => {
        cancelHandler();
        return HttpResponse.json({ ...activeReservation, status: 'CANCELLED' });
      }),
    );
    const user = userEvent.setup();

    renderEvents(`/events/${event.id}`);

    await user.click(await screen.findByRole('button', { name: 'Assento A1, disponível' }));
    await user.click(screen.getByRole('button', { name: 'Reservar assentos' }));
    expect(
      await screen.findByRole('dialog', { name: 'Você já tem uma reserva em andamento' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar reserva em andamento' }));
    expect(await screen.findByRole('dialog', { name: 'Cancelar reserva?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => expect(cancelHandler).toHaveBeenCalledOnce());
    expect(
      await screen.findByText('Reserva cancelada. Os assentos foram liberados.'),
    ).toBeInTheDocument();
  });

  it.each([
    [EventStatus.Published, true, 'Encerrado', 'Esta sessão já aconteceu'],
    [EventStatus.Cancelled, false, 'Sessão cancelada', 'Esta sessão foi cancelada'],
  ])(
    'impede início de compra na leitura %s com isPast=%s',
    async (status, isPast, label, message) => {
      server.use(
        http.get(`${apiUrl}/events/${event.id}`, () =>
          HttpResponse.json({ ...eventDetail, status, isPast }),
        ),
      );

      renderEvents(`/events/${event.id}`);

      expect(await screen.findByText(label)).toHaveAttribute('role', 'status');
      expect(screen.getByText(new RegExp(message))).toHaveTextContent('não aceita novas compras');
      expect(await screen.findByRole('button', { name: 'Assento A1, disponível' })).toBeDisabled();
    },
  );

  it('permite tentar novamente quando somente o mapa de assentos falha', async () => {
    const seatMapHandler = vi.fn(() => new HttpResponse(null, { status: 500 }));
    server.use(
      http.get(`${apiUrl}/events/${event.id}`, () => HttpResponse.json(eventDetail)),
      http.get(`${apiUrl}/events/${event.id}/seats`, () => seatMapHandler()),
    );
    const user = userEvent.setup();

    renderEvents(`/events/${event.id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o mapa de assentos.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(seatMapHandler).toHaveBeenCalledTimes(2));
  });

  it('representa como indisponível um DRAFT ou identificador inexistente', async () => {
    server.use(
      http.get(`${apiUrl}/events/${event.id}`, () =>
        HttpResponse.json({ code: 'EVENT_NOT_FOUND' }, { status: 404 }),
      ),
    );

    renderEvents(`/events/${event.id}`);

    expect(
      await screen.findByRole('heading', { name: 'Sessão não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar aos eventos' })).toHaveAttribute(
      'href',
      '/events',
    );
  });
});
