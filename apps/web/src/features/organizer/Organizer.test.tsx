import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import { UserRole } from '../auth/types';
import { server } from '../../test/server';
import { AdmissionMode, EventCategory, EventStatus } from './types';

const apiUrl = 'http://api.test';
const organizer = { id: 'organizer-1', role: UserRole.Organizer };
const venue = {
  id: '2fd430b8-1916-4f39-a76e-17c801a8c3a6',
  name: 'Cine Imperial · Sala A',
  address: 'Rua do Cinema, 93',
  city: 'Fortaleza',
  state: 'CE',
  country: 'Brasil',
  timeZone: 'America/Fortaleza',
};
const movie = {
  source: 'TMDB',
  externalId: '693134',
  category: EventCategory.Movie,
  title: 'Duna: Parte Dois',
  description: 'Paul Atreides segue sua jornada.',
  imageUrl: 'https://image.tmdb.org/poster.jpg',
  genres: ['Ficção científica'],
};

function LocationStateProbe() {
  const location = useLocation();
  return (
    <span data-testid="location-state" hidden>
      {JSON.stringify(location.state)}
    </span>
  );
}

/**
 * Renderiza uma rota do organizador com sessão e cache isolados.
 *
 * @param initialPath - Rota inicial do cenário.
 * @returns Utilitários de renderização da Testing Library.
 */
function renderOrganizer(initialPath = '/organizer') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(['auth', 'session'], organizer);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
        <LocationStateProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('gestão inicial de Events pelo organizador', () => {
  it('apresenta Events reais e publica um rascunho pelo painel', async () => {
    let published = false;
    const publishHandler = vi.fn();
    server.use(
      http.get(`${apiUrl}/organizer/me/events`, () =>
        HttpResponse.json([
          {
            id: 'event-1',
            venueId: venue.id,
            venueName: venue.name,
            venueCity: venue.city,
            venueTimeZone: venue.timeZone,
            title: movie.title,
            imageUrl: movie.imageUrl,
            genres: movie.genres,
            category: EventCategory.Movie,
            admissionMode: AdmissionMode.Seated,
            status: published ? EventStatus.Published : EventStatus.Draft,
            startsAt: '2030-09-01T23:30:00.000Z',
            priceCents: 2500,
          },
        ]),
      ),
      http.post(`${apiUrl}/events/event-1/publish`, () => {
        publishHandler();
        published = true;
        return HttpResponse.json({ id: 'event-1', status: EventStatus.Published });
      }),
    );
    const user = userEvent.setup();

    renderOrganizer();

    expect(await screen.findByRole('heading', { name: movie.title })).toBeInTheDocument();
    expect(screen.getByText('Cine Imperial · Sala A · Fortaleza')).toBeInTheDocument();
    expect(screen.getByText('R$ 25,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(publishHandler).toHaveBeenCalledOnce());
    expect(await screen.findByText('Publicado')).toBeInTheDocument();
  });

  it('cria e publica usando somente identidade externa e dados locais', async () => {
    let createBody: unknown;
    const publishHandler = vi.fn();
    server.use(
      http.get(`${apiUrl}/venues`, () => HttpResponse.json([venue])),
      http.get(`${apiUrl}/catalog/movies/popular`, () =>
        HttpResponse.json({ items: [movie], page: 1, hasMore: false }),
      ),
      http.get(`${apiUrl}/catalog/movies`, () =>
        HttpResponse.json({ items: [movie], page: 1, hasMore: false }),
      ),
      http.post(`${apiUrl}/events/movies`, async ({ request }) => {
        createBody = await request.json();
        return HttpResponse.json(
          { id: 'event-created', status: EventStatus.Draft },
          { status: 201 },
        );
      }),
      http.post(`${apiUrl}/events/event-created/publish`, () => {
        publishHandler();
        return HttpResponse.json({ id: 'event-created', status: EventStatus.Published });
      }),
      http.get(`${apiUrl}/organizer/me/events`, () => HttpResponse.json([])),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');
    await user.type(await screen.findByLabelText('Pesquisar filme'), 'Duna');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await user.click(await screen.findByRole('button', { name: /Duna: Parte Dois/ }));
    await user.click(screen.getByLabelText('Local e sala'));
    await user.click(await screen.findByRole('option', { name: venue.name }));
    expect(screen.getByLabelText('Local e sala')).toHaveTextContent(venue.name);
    expect(screen.getByLabelText('Endereço')).toHaveValue('Rua do Cinema, 93 · Fortaleza · CE');
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2030-09-01' },
    });
    fireEvent.change(screen.getByLabelText('Horário local'), {
      target: { value: '20:30' },
    });
    await user.type(screen.getByLabelText('Preço por ingresso'), '25.90');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByText('Sessão criada e publicada com sucesso.')).toHaveAttribute(
      'role',
      'status',
    );
    await waitFor(() => expect(screen.getByTestId('location-state')).toHaveTextContent('null'));
    expect(createBody).toEqual({
      externalId: movie.externalId,
      venueId: venue.id,
      startsAtLocal: '2030-09-01T20:30',
      priceCents: 2590,
    });
    expect(publishHandler).toHaveBeenCalledOnce();
  });

  it('mantém visível o rascunho recuperável quando somente a publicação falha', async () => {
    server.use(
      http.get(`${apiUrl}/venues`, () => HttpResponse.json([venue])),
      http.get(`${apiUrl}/catalog/movies/popular`, () =>
        HttpResponse.json({ items: [movie], page: 1, hasMore: false }),
      ),
      http.get(`${apiUrl}/catalog/movies`, () =>
        HttpResponse.json({ items: [movie], page: 1, hasMore: false }),
      ),
      http.post(`${apiUrl}/events/movies`, () =>
        HttpResponse.json({ id: 'event-draft', status: EventStatus.Draft }, { status: 201 }),
      ),
      http.post(`${apiUrl}/events/event-draft/publish`, () =>
        HttpResponse.json({}, { status: 409 }),
      ),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');
    await user.type(await screen.findByLabelText('Pesquisar filme'), 'Duna');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await user.click(await screen.findByRole('button', { name: /Duna: Parte Dois/ }));
    await user.click(screen.getByLabelText('Local e sala'));
    await user.click(await screen.findByRole('option', { name: venue.name }));
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2030-09-01' },
    });
    fireEvent.change(screen.getByLabelText('Horário local'), {
      target: { value: '20:30' },
    });
    await user.type(screen.getByLabelText('Preço por ingresso'), '25');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O evento foi salvo como rascunho, mas não pôde ser publicado.',
    );
    expect(screen.getByRole('link', { name: 'Ir para o painel' })).toBeInTheDocument();
  });

  it('impede selecionar uma data passada antes de enviar à API', async () => {
    const createHandler = vi.fn();
    server.use(
      http.get(`${apiUrl}/venues`, () => HttpResponse.json([venue])),
      http.get(`${apiUrl}/catalog/movies/popular`, () =>
        HttpResponse.json({ items: [movie], page: 1, hasMore: false }),
      ),
      http.post(`${apiUrl}/events/movies`, () => {
        createHandler();
        return HttpResponse.json({ id: 'unexpected' }, { status: 201 });
      }),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');
    await user.click(await screen.findByRole('button', { name: /Duna: Parte Dois/ }));
    await user.click(screen.getByLabelText('Local e sala'));
    await user.click(await screen.findByRole('option', { name: venue.name }));
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2020-01-01' } });
    fireEvent.change(screen.getByLabelText('Horário local'), { target: { value: '20:30' } });
    await user.type(screen.getByLabelText('Preço por ingresso'), '20');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Escolha uma data e um horário que ainda não passaram',
    );
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(createHandler).not.toHaveBeenCalled();
  });

  it('carrega a próxima página de filmes ao alcançar o fim da lista visível', async () => {
    let observerCallback!: IntersectionObserverCallback;
    const firstPageMovies = Array.from({ length: 10 }, (_, index) => ({
      ...movie,
      externalId: String(index + 1),
      title: `Filme ${index + 1}`,
    }));

    class IntersectionObserverMock {
      public constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      public observe(): void {
        observerCallback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }

      public disconnect(): void {}
    }

    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    server.use(
      http.get(`${apiUrl}/venues`, () => HttpResponse.json([venue])),
      http.get(`${apiUrl}/catalog/movies/popular`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));

        return page === 1
          ? HttpResponse.json({ items: firstPageMovies, page: 1, hasMore: true })
          : HttpResponse.json({
              items: [{ ...movie, externalId: '11', title: 'Filme 11' }],
              page: 2,
              hasMore: false,
            });
      }),
    );

    renderOrganizer('/organizer/events/new');

    expect(await screen.findByText('Filme 1', { exact: true })).toBeInTheDocument();
    expect(await screen.findByText('Filme 11', { exact: true })).toBeInTheDocument();
  });
});
