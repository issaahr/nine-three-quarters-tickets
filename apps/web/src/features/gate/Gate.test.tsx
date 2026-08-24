import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { UserRole } from '../auth/types';
import { formatGateEventDateTime } from '../events/eventPresentation';
import { server } from '@/test/server';
import { CheckInResult, GateEvent } from './types';

const apiUrl = 'http://api.test';
const scannerMock = vi.hoisted(() => ({
  decodeFromVideoDevice: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: vi.fn(function BrowserQRCodeReader() {
    return { decodeFromVideoDevice: scannerMock.decodeFromVideoDevice };
  }),
}));

const gateEvents: GateEvent[] = [
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
  beforeEach(() => {
    scannerMock.decodeFromVideoDevice.mockReset();
    scannerMock.stop.mockReset();

    server.use(
      http.get(`${apiUrl}/gate/events`, ({ request }) => {
        const url = new URL(request.url);
        const today = url.searchParams.get('today');
        return HttpResponse.json({
          items: today === 'true' ? [] : gateEvents,
          page: 1,
          hasMore: false,
        });
      }),
      http.get(`${apiUrl}/gate/events/:eventId`, ({ params }) => {
        const event = gateEvents.find((e) => e.id === params.eventId);
        if (!event) {
          return new HttpResponse(null, { status: 404 });
        }
        return HttpResponse.json(event);
      }),
    );
  });

  it('formata o contexto da portaria no timezone do Venue', () => {
    expect(formatGateEventDateTime('2030-08-21T23:30:00.000Z', 'America/Fortaleza')).toBe(
      'QUA · 21 AGO · 20:30 · UTC−03:00',
    );
  });

  it('permite ao GATE selecionar um Event e mostra seu contexto operacional', async () => {
    server.use(
      http.get(`${apiUrl}/gate/events`, () =>
        HttpResponse.json({ items: gateEvents, page: 1, hasMore: false }),
      ),
    );
    const user = userEvent.setup();

    renderGate();

    expect(
      await screen.findByRole('heading', { name: 'Selecione o evento em operação' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Sessão em operação/ }));

    expect(await screen.findByRole('heading', { name: 'Sessão em operação' })).toBeInTheDocument();
    expect(screen.getByText('Cine Imperial · Sala A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trocar Evento' })).toHaveAttribute('href', '/gate');
  });

  it('explica quando não há Events publicados para operar', async () => {
    server.use(
      http.get(`${apiUrl}/gate/events`, () =>
        HttpResponse.json({ items: [], page: 1, hasMore: false }),
      ),
    );

    renderGate();

    expect(
      await screen.findByRole('heading', { name: 'Nenhum Event disponível' }),
    ).toBeInTheDocument();
  });

  it('alterna entre todos os Events e somente os Events do dia atual via backend', async () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const todayEvent: GateEvent = {
      ...gateEvents[0],
      id: 'event-today',
      title: 'Event de hoje',
      startsAt: now.toISOString(),
    };
    const futureEvent: GateEvent = {
      ...gateEvents[0],
      id: 'event-future',
      title: 'Event futuro',
      startsAt: tomorrow.toISOString(),
    };

    server.use(
      http.get(`${apiUrl}/gate/events`, ({ request }) => {
        const url = new URL(request.url);
        const today = url.searchParams.get('today');
        if (today === 'true') {
          return HttpResponse.json({ items: [todayEvent], page: 1, hasMore: false });
        }
        return HttpResponse.json({ items: [todayEvent, futureEvent], page: 1, hasMore: false });
      }),
    );
    const user = userEvent.setup();

    renderGate();

    expect(await screen.findByText('Event de hoje')).toBeInTheDocument();
    expect(screen.getByText('Event futuro')).toBeInTheDocument();
    const filterButton = screen.getByRole('button', { name: 'Ver eventos de hoje' });

    await user.click(filterButton);

    expect(await screen.findByText('Event de hoje')).toBeInTheDocument();
    expect(screen.queryByText('Event futuro')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Mostrar todos' }));

    expect(await screen.findByText('Event futuro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver eventos de hoje' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('carrega mais eventos via infinite scroll quando hasMore é verdadeiro', async () => {
    const page1Events: GateEvent[] = Array.from({ length: 10 }, (_, i) => ({
      id: `page-1-${i}`,
      title: `Evento P1-${i}`,
      venueName: 'Cine Imperial · Sala A',
      venueTimeZone: 'America/Fortaleza',
      startsAt: '2030-08-25T20:00:00.000Z',
    }));
    const page2Events: GateEvent[] = [
      {
        id: 'page-2-0',
        title: 'Evento P2-Extra',
        venueName: 'Cine Imperial · Sala A',
        venueTimeZone: 'America/Fortaleza',
        startsAt: '2030-08-26T20:00:00.000Z',
      },
    ];

    let triggerObserver: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    class MockObserver implements Partial<IntersectionObserver> {
      public constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        triggerObserver = callback;
      }
      public observe(): void {}
      public disconnect(): void {}
      public unobserve(): void {}
    }
    vi.stubGlobal('IntersectionObserver', MockObserver);

    server.use(
      http.get(`${apiUrl}/gate/events`, ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get('page');
        if (page === '2') {
          return HttpResponse.json({ items: page2Events, page: 2, hasMore: false });
        }
        return HttpResponse.json({ items: page1Events, page: 1, hasMore: true });
      }),
    );

    renderGate();

    expect(await screen.findByText('Evento P1-0')).toBeInTheDocument();

    await waitFor(() => {
      expect(triggerObserver).toBeDefined();
    });

    triggerObserver!([{ isIntersecting: true } as IntersectionObserverEntry]);

    expect(await screen.findByText('Evento P2-Extra')).toBeInTheDocument();
    expect(screen.getByText('Evento P1-0')).toBeInTheDocument();
  });

  it('exibe fallback com botão de tentar novamente ao falhar próxima página da portaria', async () => {
    const page1Events: GateEvent[] = [
      {
        id: 'event-1',
        title: 'Primeiro Evento',
        venueName: 'Cine Imperial',
        venueTimeZone: 'America/Fortaleza',
        startsAt: '2030-08-25T20:00:00.000Z',
      },
    ];
    const page2Events: GateEvent[] = [
      {
        id: 'event-2',
        title: 'Segundo Evento Recuperado',
        venueName: 'Cine Imperial',
        venueTimeZone: 'America/Fortaleza',
        startsAt: '2030-08-26T20:00:00.000Z',
      },
    ];

    let triggerObserver: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    class MockObserver implements Partial<IntersectionObserver> {
      public constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        triggerObserver = callback;
      }
      public observe(): void {}
      public disconnect(): void {}
      public unobserve(): void {}
    }
    vi.stubGlobal('IntersectionObserver', MockObserver);

    let failNextPage = true;
    server.use(
      http.get(`${apiUrl}/gate/events`, ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get('page');
        if (page === '2') {
          if (failNextPage) {
            return new HttpResponse(null, { status: 500 });
          }
          return HttpResponse.json({ items: page2Events, page: 2, hasMore: false });
        }
        return HttpResponse.json({ items: page1Events, page: 1, hasMore: true });
      }),
    );
    const user = userEvent.setup();

    renderGate();

    expect(await screen.findByText('Primeiro Evento')).toBeInTheDocument();

    await waitFor(() => {
      expect(triggerObserver).toBeDefined();
    });

    triggerObserver!([{ isIntersecting: true } as IntersectionObserverEntry]);

    expect(await screen.findByText('Não foi possível carregar mais eventos.')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Tentar novamente' });

    failNextPage = false;
    await user.click(retryButton);

    expect(await screen.findByText('Segundo Evento Recuperado')).toBeInTheDocument();
    expect(screen.getByText('Primeiro Evento')).toBeInTheDocument();
  });

  it('exige uma nova seleção quando a rota não identifica um Event operável', async () => {
    server.use(
      http.get(
        `${apiUrl}/gate/events/event-inexistente`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    renderGate('/gate/events/event-inexistente');

    expect(await screen.findByRole('heading', { name: 'Evento indisponível' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escolher Evento' })).toHaveAttribute('href', '/gate');
  });

  it.each([
    [CheckInResult.Valid, 'Entrada liberada'],
    [CheckInResult.Invalid, 'Credencial inválida'],
    [CheckInResult.AlreadyUsed, 'Ingresso já utilizado'],
    [CheckInResult.Cancelled, 'Ingresso cancelado'],
  ])('valida código manual para o resultado %s', async (result, heading) => {
    let requestBody: unknown;
    server.use(
      http.get(`${apiUrl}/gate/events/event-1`, () => HttpResponse.json(gateEvents[0])),
      http.post(`${apiUrl}/gate/events/event-1/check-in/manual-code`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ result });
      }),
    );
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.type(await screen.findByLabelText('Código manual'), '7k4p m9q2');
    await user.click(screen.getByRole('button', { name: 'Validar ingresso' }));

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(requestBody).toEqual({ manualCode: '7k4p m9q2' });
  });

  it('usa a mensagem única de evento diferente', async () => {
    server.use(
      http.get(`${apiUrl}/gate/events/event-1`, () => HttpResponse.json(gateEvents[0])),
      http.post(`${apiUrl}/gate/events/event-1/check-in/manual-code`, () =>
        HttpResponse.json({ result: CheckInResult.EventMismatch }),
      ),
    );
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.type(await screen.findByLabelText('Código manual'), '7K4P-M9Q2');
    await user.click(screen.getByRole('button', { name: 'Validar ingresso' }));

    expect(await screen.findByRole('heading', { name: 'Evento diferente' })).toBeInTheDocument();
    expect(screen.getByText('Ingresso não pertence a este evento')).toBeInTheDocument();
  });

  it('trata limite de requisições na validação manual', async () => {
    server.use(
      http.get(`${apiUrl}/gate/events/event-1`, () => HttpResponse.json(gateEvents[0])),
      http.post(`${apiUrl}/gate/events/event-1/check-in/manual-code`, () =>
        HttpResponse.json(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Muitas tentativas. Aguarde um momento antes de tentar novamente.',
          },
          { status: 429 },
        ),
      ),
    );
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.type(await screen.findByLabelText('Código manual'), '7K4P-M9Q2');
    await user.click(screen.getByRole('button', { name: 'Validar ingresso' }));

    expect(
      await screen.findByText('Muitas tentativas. Aguarde um momento antes de tentar novamente.'),
    ).toBeInTheDocument();
  });

  it('permite nova leitura após um resultado', async () => {
    server.use(
      http.get(`${apiUrl}/gate/events/event-1`, () => HttpResponse.json(gateEvents[0])),
      http.post(`${apiUrl}/gate/events/event-1/check-in/manual-code`, () =>
        HttpResponse.json({ result: CheckInResult.Valid }),
      ),
    );
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.type(await screen.findByLabelText('Código manual'), '7K4P-M9Q2');
    await user.click(screen.getByRole('button', { name: 'Validar ingresso' }));
    await user.click(await screen.findByRole('button', { name: 'Nova validação' }));

    expect(await screen.findByLabelText('Código manual')).toHaveValue('');
  });

  it('lê credencial pela câmera e interrompe o scanner após validar', async () => {
    let requestBody: unknown;
    scannerMock.decodeFromVideoDevice.mockImplementationOnce(
      (
        _deviceId: string | undefined,
        _videoElement: unknown,
        onResult: (
          result: { getText: () => string } | undefined,
          error: unknown,
          controls: { stop: () => void },
        ) => void,
      ) => {
        onResult({ getText: () => 'v1.ticket.signature' }, undefined, {
          stop: scannerMock.stop,
        });
        return { stop: scannerMock.stop };
      },
    );
    server.use(
      http.get(`${apiUrl}/gate/events/event-1`, () => HttpResponse.json(gateEvents[0])),
      http.post(`${apiUrl}/gate/events/event-1/check-in`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ result: CheckInResult.Valid });
      }),
    );
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    const activateCameraButton = await screen.findByRole('button', { name: 'Ativar câmera' });
    expect(activateCameraButton).toHaveClass('mt-4', 'self-center', 'sm:absolute');
    await user.click(activateCameraButton);

    expect(await screen.findByRole('heading', { name: 'Entrada liberada' })).toBeInTheDocument();
    expect(requestBody).toEqual({ credential: 'v1.ticket.signature' });
    expect(scannerMock.stop).toHaveBeenCalledOnce();
  });

  it('mantém entrada manual disponível quando não consegue acessar a câmera', async () => {
    scannerMock.decodeFromVideoDevice.mockRejectedValueOnce(new Error('Câmera indisponível'));
    server.use(http.get(`${apiUrl}/gate/events/event-1`, () => HttpResponse.json(gateEvents[0])));
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.click(await screen.findByRole('button', { name: 'Ativar câmera' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Não foi possível acessar a câmera. Verifique a permissão ou use o código manual.',
    );
    expect(screen.getByLabelText('Código manual')).toBeEnabled();
  });
});
