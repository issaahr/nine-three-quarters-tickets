import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { App } from '../../App';
import { UserRole } from '../auth/types';
import { server } from '../../test/server';

const apiUrl = 'http://api.test';

const gateEvents = [
  {
    id: 'event-1',
    title: 'Sessão em operação',
    venueName: 'Cine Imperial · Sala A',
    venueTimeZone: 'America/Fortaleza',
    startsAt: '2030-08-25T22:30:00.000Z',
  },
];

function renderGate(initialPath = '/gate') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(['auth', 'session'], { id: 'gate-1', role: UserRole.Gate });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Contexto ativo da portaria', () => {
  it('permite ao GATE selecionar um Event e mostra seu contexto operacional', async () => {
    server.use(http.get(`${apiUrl}/gate/events`, () => HttpResponse.json(gateEvents)));
    const user = userEvent.setup();

    renderGate();

    expect(
      await screen.findByRole('heading', { name: 'Selecione o evento em operação' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Sessão em operação/ }));

    expect(await screen.findByRole('heading', { name: 'Sessão em operação' })).toBeInTheDocument();
    expect(screen.getByText('Cine Imperial · Sala A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trocar Event' })).toHaveAttribute('href', '/gate');
  });

  it('explica quando não há Events publicados para operar', async () => {
    server.use(http.get(`${apiUrl}/gate/events`, () => HttpResponse.json([])));

    renderGate();

    expect(
      await screen.findByRole('heading', { name: 'Nenhum Event disponível' }),
    ).toBeInTheDocument();
  });

  it('alterna entre todos os Events e somente os Events do dia atual', async () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    server.use(
      http.get(`${apiUrl}/gate/events`, () =>
        HttpResponse.json([
          { ...gateEvents[0], title: 'Event de hoje', startsAt: now.toISOString() },
          {
            ...gateEvents[0],
            id: 'event-2',
            title: 'Event futuro',
            startsAt: tomorrow.toISOString(),
          },
        ]),
      ),
    );
    const user = userEvent.setup();

    renderGate();

    expect(await screen.findByText('Event de hoje')).toBeInTheDocument();
    expect(screen.getByText('Event futuro')).toBeInTheDocument();
    const filterButton = screen.getByRole('button', { name: 'Ver eventos de hoje' });

    await user.click(filterButton);

    expect(screen.getByText('Event de hoje')).toBeInTheDocument();
    expect(screen.queryByText('Event futuro')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Mostrar todos' }));

    expect(screen.getByText('Event futuro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver eventos de hoje' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('exige uma nova seleção quando a rota não identifica um Event operável', async () => {
    server.use(http.get(`${apiUrl}/gate/events`, () => HttpResponse.json(gateEvents)));

    renderGate('/gate/events/event-inexistente');

    expect(await screen.findByRole('heading', { name: 'Event indisponível' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escolher Event' })).toHaveAttribute('href', '/gate');
  });
});
