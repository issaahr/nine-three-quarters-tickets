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
  EventStatus,
} from './types';

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

  it('diferencia uma busca sem correspondências do catálogo vazio', async () => {
    server.use(
      http.get(`${apiUrl}/events`, () => HttpResponse.json({ items: [], page: 1, hasMore: false })),
    );
    const user = userEvent.setup();
    renderEvents();

    await screen.findByRole('heading', { name: 'Nenhum evento disponível' });
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

  it.each([
    [EventStatus.Published, true, 'Sessão encerrada', 'Esta sessão já aconteceu'],
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
    },
  );

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
