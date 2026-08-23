import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import { UserRole } from '../auth/types';
import { AdmissionMode, EventCategory } from '../events/types';
import { server } from '../../test/server';
import { EventStatus } from './types';

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
  admissionMode: AdmissionMode.Seated,
};
const generalAdmissionVenue = {
  id: '93400000-0000-4000-8000-000000000002',
  name: 'Nexus Arena',
  address: 'Rua dos Alfeneiros, 4',
  city: 'Belém',
  state: 'Pará',
  country: 'Brasil',
  timeZone: 'America/Belem',
  admissionMode: AdmissionMode.GeneralAdmission,
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
const attraction = {
  source: 'TICKETMASTER',
  externalId: 'K8vZ917Gku7',
  category: EventCategory.Show,
  title: 'Coldplay',
  description: 'Turnê mundial da banda.',
  imageUrl: 'https://s1.ticketm.net/coldplay.jpg',
  genres: ['Rock'],
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
            isActive: false,
            soldTickets: 12,
            inventoryTotal: 60,
            revenueCents: 30000,
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
    expect(screen.getByRole('link', { name: 'Criar evento' })).toBeInTheDocument();
    expect(screen.getByText('Cine Imperial · Sala A · Fortaleza')).toBeInTheDocument();
    expect(screen.getByText('R$ 25,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(publishHandler).toHaveBeenCalledOnce());
    expect(await screen.findByText('Publicado')).toBeInTheDocument();
  });

  it('filtra localmente por título, tipo, status e período sem alterar os indicadores globais', async () => {
    server.use(
      http.get(`${apiUrl}/organizer/me/events`, () =>
        HttpResponse.json([
          {
            id: 'event-movie',
            venueId: venue.id,
            venueName: venue.name,
            venueCity: venue.city,
            venueTimeZone: venue.timeZone,
            title: 'Duna: Parte Dois',
            genres: movie.genres,
            category: EventCategory.Movie,
            admissionMode: AdmissionMode.Seated,
            status: EventStatus.Published,
            startsAt: '2030-09-01T23:30:00.000Z',
            priceCents: 2500,
            isActive: true,
            soldTickets: 12,
            availableTickets: 48,
            inventoryTotal: 60,
            revenueCents: 30000,
          },
          {
            id: 'event-show',
            venueId: generalAdmissionVenue.id,
            venueName: generalAdmissionVenue.name,
            venueCity: generalAdmissionVenue.city,
            venueTimeZone: generalAdmissionVenue.timeZone,
            title: 'Coldplay',
            genres: attraction.genres,
            category: EventCategory.Show,
            admissionMode: AdmissionMode.GeneralAdmission,
            status: EventStatus.Draft,
            startsAt: '2030-10-02T01:00:00.000Z',
            priceCents: 15000,
            isActive: false,
            soldTickets: 3,
            availableTickets: 497,
            inventoryTotal: 500,
            revenueCents: 45000,
          },
          {
            id: 'event-cancelled',
            venueId: venue.id,
            venueName: venue.name,
            venueCity: venue.city,
            venueTimeZone: venue.timeZone,
            title: 'Sessão cancelada',
            genres: movie.genres,
            category: EventCategory.Movie,
            admissionMode: AdmissionMode.Seated,
            status: EventStatus.Cancelled,
            startsAt: '2030-11-01T23:30:00.000Z',
            priceCents: 3000,
            isActive: false,
            soldTickets: 1,
            availableTickets: null,
            inventoryTotal: null,
            revenueCents: 0,
          },
        ]),
      ),
    );
    const user = userEvent.setup();

    renderOrganizer();
    expect(await screen.findByRole('heading', { name: 'Duna: Parte Dois' })).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('R$ 750,00')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Pesquisar por título'), 'cold');
    expect(screen.getByRole('heading', { name: 'Coldplay' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Duna: Parte Dois' })).not.toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('R$ 750,00')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Pesquisar por título'));
    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), EventCategory.Movie);
    await user.selectOptions(screen.getByLabelText('Filtrar por status'), EventStatus.Cancelled);
    expect(screen.getByRole('heading', { name: 'Sessão cancelada' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Duna: Parte Dois' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrar por status'), 'ALL');
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2030-11-01' } });
    expect(screen.getByRole('heading', { name: 'Sessão cancelada' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Duna: Parte Dois' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Pesquisar por título'));
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '' } });
    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), EventCategory.Show);
    await user.type(screen.getByLabelText('Pesquisar por título'), 'não encontrado');
    expect(
      await screen.findByRole('heading', { name: 'Nenhum evento encontrado' }),
    ).toBeInTheDocument();
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
    expect(await screen.findByText(movie.description)).toBeInTheDocument();
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

    expect(await screen.findByText('Evento criado e publicado com sucesso.')).toHaveAttribute(
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

  it('cria e publica um show por um fluxo separado com capacidade local', async () => {
    let createBody: unknown;
    const attractionSearchHandler = vi.fn();
    const venueAdmissionModeHandler = vi.fn();
    const publishHandler = vi.fn();
    server.use(
      http.get(`${apiUrl}/venues`, ({ request }) => {
        venueAdmissionModeHandler(new URL(request.url).searchParams.get('admissionMode'));
        return HttpResponse.json([generalAdmissionVenue]);
      }),
      http.get(`${apiUrl}/catalog/movies/popular`, () =>
        HttpResponse.json({ items: [movie], page: 1, hasMore: false }),
      ),
      http.get(`${apiUrl}/catalog/attractions`, ({ request }) => {
        attractionSearchHandler(new URL(request.url).searchParams.get('query'));
        return HttpResponse.json({ items: [attraction], page: 1, hasMore: false });
      }),
      http.get(`${apiUrl}/catalog/attractions/relevant`, () =>
        HttpResponse.json({ items: [attraction], page: 1, hasMore: false }),
      ),
      http.post(`${apiUrl}/events/shows`, async ({ request }) => {
        createBody = await request.json();
        return HttpResponse.json(
          { id: 'show-created', status: EventStatus.Draft },
          { status: 201 },
        );
      }),
      http.post(`${apiUrl}/events/show-created/publish`, () => {
        publishHandler();
        return HttpResponse.json({ id: 'show-created', status: EventStatus.Published });
      }),
      http.get(`${apiUrl}/organizer/me/events`, () => HttpResponse.json([])),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');
    await screen.findByRole('heading', { name: 'Filmes em alta' });
    await user.click(screen.getByRole('button', { name: /Show/ }));

    expect(screen.getByRole('heading', { name: 'Shows relevantes no Brasil' })).toBeInTheDocument();
    expect(screen.queryByText(movie.title)).not.toBeInTheDocument();
    expect(screen.queryByText(attraction.description)).not.toBeInTheDocument();
    expect(attractionSearchHandler).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Pesquisar atração'), attraction.title);
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await user.click(await screen.findByRole('button', { name: /Coldplay/ }));
    await user.click(screen.getByLabelText('Local'));
    await user.click(await screen.findByRole('option', { name: generalAdmissionVenue.name }));
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2030-09-01' },
    });
    fireEvent.change(screen.getByLabelText('Horário local'), {
      target: { value: '20:30' },
    });
    await user.type(screen.getByLabelText('Preço por ingresso'), '150');
    await user.type(screen.getByLabelText('Capacidade de entrada geral'), '0');

    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByLabelText('Capacidade de entrada geral')).toHaveClass(
      '[appearance:textfield]',
    );

    await user.clear(screen.getByLabelText('Capacidade de entrada geral'));
    await user.type(screen.getByLabelText('Capacidade de entrada geral'), '500');
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByText('Evento criado e publicado com sucesso.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(attractionSearchHandler).toHaveBeenCalledWith(attraction.title);
    expect(venueAdmissionModeHandler).toHaveBeenCalledWith(AdmissionMode.GeneralAdmission);
    expect(createBody).toEqual({
      externalId: attraction.externalId,
      venueId: generalAdmissionVenue.id,
      startsAtLocal: '2030-09-01T20:30',
      priceCents: 15000,
      capacity: 500,
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Data e/ou hora inválidas');
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

  it('mantém paginação infinita ao pesquisar atrações para um show', async () => {
    let observerCallback!: IntersectionObserverCallback;

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
      http.get(`${apiUrl}/catalog/movies/popular`, () =>
        HttpResponse.json({ items: [movie], page: 1, hasMore: false }),
      ),
      http.get(`${apiUrl}/catalog/attractions`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));

        return page === 1
          ? HttpResponse.json({ items: [attraction], page: 1, hasMore: true })
          : HttpResponse.json({
              items: [
                {
                  ...attraction,
                  externalId: 'K8vZ917Second',
                  title: 'System of a Down',
                },
              ],
              page: 2,
              hasMore: false,
            });
      }),
      http.get(`${apiUrl}/catalog/attractions/relevant`, () =>
        HttpResponse.json({ items: [attraction], page: 1, hasMore: false }),
      ),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');
    await user.click(screen.getByRole('button', { name: /Show/ }));
    await user.type(screen.getByLabelText('Pesquisar atração'), 'system');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText(attraction.title, { exact: true })).toBeInTheDocument();
    expect(await screen.findByText('System of a Down', { exact: true })).toBeInTheDocument();
  });
});
