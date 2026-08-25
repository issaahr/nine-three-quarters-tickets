import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { UserRole } from '../auth/types';
import { AdmissionMode, EventCategory } from '../events/types';
import { server } from '@/test/server';
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
        HttpResponse.json({
          items: [
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
          ],
          page: 1,
          hasMore: false,
        }),
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

  it('atualiza a busca via backend ao filtrar por título, tipo, status e período', async () => {
    const allItems = [
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
    ];

    function eventVenueDate(item: (typeof allItems)[number]): string {
      return new Intl.DateTimeFormat('en-CA', { timeZone: item.venueTimeZone }).format(
        new Date(item.startsAt),
      );
    }

    server.use(
      http.get(`${apiUrl}/organizer/me/events`, ({ request }) => {
        const url = new URL(request.url);
        const query = url.searchParams.get('query')?.toLowerCase() ?? '';
        const category = url.searchParams.get('category');
        const status = url.searchParams.get('status');
        const dateFrom = url.searchParams.get('dateFrom');
        const dateTo = url.searchParams.get('dateTo');

        const filtered = allItems.filter((item) => {
          const eventDate = eventVenueDate(item);
          return (
            (!query || item.title.toLowerCase().includes(query)) &&
            (!category || item.category === category) &&
            (!status || item.status === status) &&
            (!dateFrom || eventDate >= dateFrom) &&
            (!dateTo || eventDate <= dateTo)
          );
        });

        return HttpResponse.json({ items: filtered, page: 1, hasMore: false });
      }),
    );

    const user = userEvent.setup();
    renderOrganizer();

    expect(await screen.findByRole('heading', { name: 'Duna: Parte Dois' })).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('R$ 750,00')).toBeInTheDocument();
    expect(screen.getByText('Título')).toBeInTheDocument();
    expect(screen.getByText('Categoria')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('A partir de dd/mm/aaaa')).toBeInTheDocument();
    expect(screen.getByText('Até dd/mm/aaaa')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Pesquisar por título'), 'cold{enter}');
    expect(await screen.findByRole('heading', { name: 'Coldplay' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Duna: Parte Dois' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Pesquisar por título'));
    await user.keyboard('{enter}');
    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), EventCategory.Movie);
    await user.selectOptions(screen.getByLabelText('Filtrar por status'), EventStatus.Cancelled);
    expect(await screen.findByRole('heading', { name: 'Sessão cancelada' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Duna: Parte Dois' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrar por status'), 'ALL');
    fireEvent.change(screen.getByLabelText('A partir de dd/mm/aaaa'), {
      target: { value: '2030-11-01' },
    });
    expect(await screen.findByRole('heading', { name: 'Sessão cancelada' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Duna: Parte Dois' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('A partir de dd/mm/aaaa'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Até dd/mm/aaaa'), { target: { value: '2030-09-30' } });
    expect(await screen.findByRole('heading', { name: 'Duna: Parte Dois' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coldplay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sessão cancelada' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Até dd/mm/aaaa'), { target: { value: '' } });
    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), EventCategory.Show);
    await user.type(screen.getByLabelText('Pesquisar por título'), 'não encontrado{enter}');
    expect(
      await screen.findByRole('heading', { name: 'Nenhum evento encontrado' }),
    ).toBeInTheDocument();
  });

  it('reordena via backend entre mais recentes e mais antigos', async () => {
    const items = [
      {
        id: 'event-1',
        venueId: venue.id,
        venueName: venue.name,
        venueCity: venue.city,
        venueTimeZone: venue.timeZone,
        title: 'Evento Antigo',
        genres: movie.genres,
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Published,
        createdAt: '2030-01-01T10:00:00.000Z',
        startsAt: '2030-12-01T20:00:00.000Z',
        priceCents: 2000,
        isActive: true,
        soldTickets: 0,
        availableTickets: 50,
        inventoryTotal: 50,
        revenueCents: 0,
      },
      {
        id: 'event-2',
        venueId: venue.id,
        venueName: venue.name,
        venueCity: venue.city,
        venueTimeZone: venue.timeZone,
        title: 'Evento Recente',
        genres: movie.genres,
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Published,
        createdAt: '2030-02-01T10:00:00.000Z',
        startsAt: '2030-01-01T20:00:00.000Z',
        priceCents: 2000,
        isActive: true,
        soldTickets: 0,
        availableTickets: 50,
        inventoryTotal: 50,
        revenueCents: 0,
      },
    ];

    server.use(
      http.get(`${apiUrl}/organizer/me/events`, ({ request }) => {
        const url = new URL(request.url);
        const sort = url.searchParams.get('sort') ?? 'recent';
        const sorted = [...items].sort((a, b) => {
          const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          return sort === 'oldest' ? diff : -diff;
        });
        return HttpResponse.json({ items: sorted, page: 1, hasMore: false });
      }),
    );

    const user = userEvent.setup();
    renderOrganizer();

    expect(await screen.findByRole('heading', { name: 'Evento Recente' })).toBeInTheDocument();
    const headingsDefault = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headingsDefault).toEqual(['Evento Recente', 'Evento Antigo']);

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'oldest');
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual(['Evento Antigo', 'Evento Recente']);
    });

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'recent');
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual(['Evento Recente', 'Evento Antigo']);
    });
  });

  it('aplica espaçamento lateral no título do card no mobile para quebra de linha antes do badge de status', async () => {
    server.use(
      http.get(`${apiUrl}/organizer/me/events`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'event-long',
              venueId: venue.id,
              venueName: venue.name,
              venueCity: venue.city,
              venueTimeZone: venue.timeZone,
              title:
                'Um Título Muito Longo Para Ocorrência Que Deveria Quebrar Linha Sem Invadir o Status',
              genres: movie.genres,
              category: EventCategory.Movie,
              admissionMode: AdmissionMode.Seated,
              status: EventStatus.Published,
              startsAt: '2030-09-01T20:00:00.000Z',
              priceCents: 2000,
              isActive: true,
              soldTickets: 0,
              availableTickets: 50,
              inventoryTotal: 50,
              revenueCents: 0,
            },
          ],
          page: 1,
          hasMore: false,
        }),
      ),
    );

    renderOrganizer();

    const titleHeading = await screen.findByRole('heading', {
      name: /Um Título Muito Longo/,
    });
    expect(titleHeading.parentElement).toHaveClass('pr-24', 'sm:pr-0');
  });

  it('carrega páginas subsequentes com scroll infinito no painel do organizador e suporta retry em falhas', async () => {
    let observerCallback: IntersectionObserverCallback = () => {};

    class IntersectionObserverMock implements Partial<IntersectionObserver> {
      public constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      public observe(): void {}
      public disconnect(): void {}
    }

    function triggerObserver(): void {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }

    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

    let page2Requests = 0;
    server.use(
      http.get(`${apiUrl}/organizer/me/events`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') || '1');
        if (page === 1) {
          return HttpResponse.json({
            items: [
              {
                id: 'event-page1',
                venueId: venue.id,
                venueName: venue.name,
                venueCity: venue.city,
                venueTimeZone: venue.timeZone,
                title: 'Evento Página 1',
                genres: movie.genres,
                category: EventCategory.Movie,
                admissionMode: AdmissionMode.Seated,
                status: EventStatus.Published,
                createdAt: '2030-01-01T10:00:00.000Z',
                startsAt: '2030-12-01T20:00:00.000Z',
                priceCents: 2000,
                isActive: true,
                soldTickets: 5,
                availableTickets: 45,
                inventoryTotal: 50,
                revenueCents: 10000,
              },
            ],
            page: 1,
            hasMore: true,
          });
        }
        page2Requests++;
        if (page2Requests === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({
          items: [
            {
              id: 'event-page2',
              venueId: venue.id,
              venueName: venue.name,
              venueCity: venue.city,
              venueTimeZone: venue.timeZone,
              title: 'Evento Página 2',
              genres: movie.genres,
              category: EventCategory.Movie,
              admissionMode: AdmissionMode.Seated,
              status: EventStatus.Published,
              createdAt: '2030-01-02T10:00:00.000Z',
              startsAt: '2030-12-02T20:00:00.000Z',
              priceCents: 2500,
              isActive: true,
              soldTickets: 2,
              availableTickets: 48,
              inventoryTotal: 50,
              revenueCents: 5000,
            },
          ],
          page: 2,
          hasMore: false,
        });
      }),
    );

    const user = userEvent.setup();
    renderOrganizer();

    expect(await screen.findByRole('heading', { name: 'Evento Página 1' })).toBeInTheDocument();

    triggerObserver();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar mais eventos.',
    );
    expect(screen.getByRole('heading', { name: 'Evento Página 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('heading', { name: 'Evento Página 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evento Página 1' })).toBeInTheDocument();
  });

  it('apresenta empty state com "Crie seu primeiro evento" quando o organizador não possui eventos', async () => {
    server.use(
      http.get(`${apiUrl}/organizer/me/events`, () =>
        HttpResponse.json({ items: [], page: 1, hasMore: false }),
      ),
    );

    renderOrganizer();

    expect(
      await screen.findByRole('heading', { name: 'Crie seu primeiro evento' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Escolha um filme ou show, defina o local e o horário e publique seu primeiro evento.',
      ),
    ).toBeInTheDocument();
  });

  it('destaca o card selecionado com bg-primary e p-[2px] e os não selecionados com bg-border-light e p-[3px]', async () => {
    server.use(
      http.get(`${apiUrl}/venues`, () => HttpResponse.json([venue])),
      http.get(`${apiUrl}/catalog/movies/popular`, () =>
        HttpResponse.json({
          items: [
            movie,
            {
              ...movie,
              externalId: 'movie-2',
              title: 'Interestelar',
            },
          ],
          page: 1,
          hasMore: false,
        }),
      ),
      http.get(`${apiUrl}/organizer/me/events`, () =>
        HttpResponse.json({ items: [], page: 1, hasMore: false }),
      ),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');

    const dunaButton = await screen.findByRole('button', { name: /Duna: Parte Dois/ });
    const interestelarButton = screen.getByRole('button', { name: /Interestelar/ });

    expect(dunaButton).toHaveClass('bg-border-light', 'p-[3px]');
    expect(interestelarButton).toHaveClass('bg-border-light', 'p-[3px]');

    await user.click(dunaButton);

    expect(dunaButton).toHaveClass('bg-primary', 'p-[2px]');
    expect(interestelarButton).toHaveClass('bg-border-light', 'p-[3px]');
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
      http.get(`${apiUrl}/organizer/me/events`, () =>
        HttpResponse.json({ items: [], page: 1, hasMore: false }),
      ),
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
      http.get(`${apiUrl}/catalog/attractions/popular`, () =>
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
      http.get(`${apiUrl}/organizer/me/events`, () =>
        HttpResponse.json({ items: [], page: 1, hasMore: false }),
      ),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');
    await screen.findByRole('heading', { name: 'Filmes em alta' });
    await user.click(screen.getByRole('button', { name: /Show/ }));

    expect(screen.getByRole('heading', { name: 'Shows em alta' })).toBeInTheDocument();
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

  it('interrompe a paginação automática de filmes após falha incremental e permite repetir a página', async () => {
    let observerCallback!: IntersectionObserverCallback;
    let failedPageThree = false;
    const catalogHandler = vi.fn(({ request }: { request: Request }) => {
      const page = Number(new URL(request.url).searchParams.get('page'));

      if (page === 3 && !failedPageThree) {
        failedPageThree = true;
        return new HttpResponse(null, { status: 502 });
      }

      const pageItems =
        page === 1
          ? Array.from({ length: 10 }, (_, index) => ({
              ...movie,
              externalId: String(index + 1),
              title: `Filme ${index + 1}`,
            }))
          : [{ ...movie, externalId: String(page * 10 + 1), title: `Filme ${page * 10 + 1}` }];

      return HttpResponse.json({ items: pageItems, page, hasMore: page < 3 });
    });

    class IntersectionObserverMock {
      public constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      public observe(): void {}

      public disconnect(): void {}
    }

    function triggerObserver(): void {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }

    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    server.use(
      http.get(`${apiUrl}/venues`, () => HttpResponse.json([venue])),
      http.get(`${apiUrl}/catalog/movies/popular`, catalogHandler),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');

    expect(await screen.findByText('Filme 1', { exact: true })).toBeInTheDocument();
    triggerObserver();
    await waitFor(() => expect(catalogHandler).toHaveBeenCalledTimes(2));
    triggerObserver();
    expect(await screen.findByText('Filme 21', { exact: true })).toBeInTheDocument();
    triggerObserver();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar mais filmes.',
    );
    expect(screen.getByText('Filme 1', { exact: true })).toBeInTheDocument();
    triggerObserver();
    triggerObserver();
    await waitFor(() => expect(catalogHandler).toHaveBeenCalledTimes(3));

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(catalogHandler).toHaveBeenCalledTimes(4));
    triggerObserver();
    expect(await screen.findByText('Filme 31', { exact: true })).toBeInTheDocument();
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
      http.get(`${apiUrl}/catalog/attractions/popular`, () =>
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

  it('interrompe a paginação automática de atrações após falha incremental e permite repetir a página', async () => {
    let observerCallback!: IntersectionObserverCallback;
    let failedPageThree = false;
    const attractionsHandler = vi.fn(({ request }: { request: Request }) => {
      const page = Number(new URL(request.url).searchParams.get('page'));

      if (page === 3 && !failedPageThree) {
        failedPageThree = true;
        return new HttpResponse(null, { status: 502 });
      }

      const pageItems =
        page === 1
          ? Array.from({ length: 10 }, (_, index) => ({
              ...attraction,
              externalId: `attraction-${index + 1}`,
              title: `Atração ${index + 1}`,
            }))
          : [
              {
                ...attraction,
                externalId: `attraction-${page * 10 + 1}`,
                title: `Atração ${page * 10 + 1}`,
              },
            ];

      return HttpResponse.json({ items: pageItems, page, hasMore: page < 3 });
    });

    class IntersectionObserverMock {
      public constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      public observe(): void {}

      public disconnect(): void {}
    }

    function triggerObserver(): void {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }

    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    server.use(
      http.get(`${apiUrl}/venues`, ({ request }) => {
        const admissionMode = new URL(request.url).searchParams.get('admissionMode');
        return HttpResponse.json(
          admissionMode === AdmissionMode.GeneralAdmission ? [generalAdmissionVenue] : [venue],
        );
      }),
      http.get(`${apiUrl}/catalog/movies/popular`, () =>
        HttpResponse.json({ items: [movie], page: 1, hasMore: false }),
      ),
      http.get(`${apiUrl}/catalog/attractions/popular`, attractionsHandler),
    );
    const user = userEvent.setup();

    renderOrganizer('/organizer/events/new');
    await user.click(screen.getByRole('button', { name: /Show/ }));

    expect(await screen.findByText('Atração 1', { exact: true })).toBeInTheDocument();
    triggerObserver();
    await waitFor(() => expect(attractionsHandler).toHaveBeenCalledTimes(2));
    triggerObserver();
    expect(await screen.findByText('Atração 21', { exact: true })).toBeInTheDocument();
    triggerObserver();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar mais atrações.',
    );
    expect(screen.getByText('Atração 1', { exact: true })).toBeInTheDocument();
    triggerObserver();
    triggerObserver();
    await waitFor(() => expect(attractionsHandler).toHaveBeenCalledTimes(3));

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(attractionsHandler).toHaveBeenCalledTimes(4));
    triggerObserver();
    expect(await screen.findByText('Atração 31', { exact: true })).toBeInTheDocument();
  });
});
