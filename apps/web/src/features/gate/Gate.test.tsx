import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import { UserRole } from '../auth/types';
import { formatGateEventDateTime } from '../events/eventPresentation';
import { server } from '../../test/server';
import { CheckInResult } from './types';

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
  beforeEach(() => {
    scannerMock.decodeFromVideoDevice.mockReset();
    scannerMock.stop.mockReset();
  });

  it('formata o contexto da portaria no timezone do Venue', () => {
    expect(formatGateEventDateTime('2030-08-21T23:30:00.000Z', 'America/Fortaleza')).toBe(
      'QUA · 21 AGO · 20:30 · UTC−03:00',
    );
  });

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
    expect(screen.getByRole('link', { name: 'Trocar Evento' })).toHaveAttribute('href', '/gate');
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

    expect(await screen.findByRole('heading', { name: 'Evento indisponível' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escolher Evento' })).toHaveAttribute('href', '/gate');
  });

  it.each([
    [CheckInResult.Valid, 'Entrada liberada'],
    [CheckInResult.Invalid, 'Credencial inválida'],
    [CheckInResult.AlreadyUsed, 'Ingresso já utilizado'],
    [CheckInResult.EventMismatch, 'Evento diferente'],
    [CheckInResult.Cancelled, 'Ingresso cancelado'],
  ])('apresenta o resultado operacional %s da entrada manual', async (result, title) => {
    let requestBody: unknown;
    server.use(
      http.get(`${apiUrl}/gate/events`, () => HttpResponse.json(gateEvents)),
      http.post(`${apiUrl}/gate/events/event-1/check-in/manual-code`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ result });
      }),
    );
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.type(await screen.findByLabelText('Código manual'), '7k4p m9q2');
    await user.click(screen.getByRole('button', { name: 'Validar ingresso' }));

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(requestBody).toEqual({ manualCode: '7k4p m9q2' });
    expect(screen.getByRole('button', { name: 'Nova validação' })).toBeInTheDocument();
  });

  it('usa a mensagem única de evento diferente', async () => {
    server.use(
      http.get(`${apiUrl}/gate/events`, () => HttpResponse.json(gateEvents)),
      http.post(`${apiUrl}/gate/events/event-1/check-in/manual-code`, () =>
        HttpResponse.json({ result: CheckInResult.EventMismatch }),
      ),
    );
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.type(await screen.findByLabelText('Código manual'), '7K4P-M9Q2');
    await user.click(screen.getByRole('button', { name: 'Validar ingresso' }));

    expect(await screen.findByText('Ingresso não pertence a este evento')).toBeInTheDocument();
  });

  it('informa falha técnica sem fabricar resultado de check-in', async () => {
    server.use(
      http.get(`${apiUrl}/gate/events`, () => HttpResponse.json(gateEvents)),
      http.post(
        `${apiUrl}/gate/events/event-1/check-in/manual-code`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.type(await screen.findByLabelText('Código manual'), '7K4P-M9Q2');
    await user.click(screen.getByRole('button', { name: 'Validar ingresso' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível validar o ingresso. Tente novamente.',
    );
    expect(screen.queryByRole('heading', { name: 'Entrada liberada' })).not.toBeInTheDocument();
  });

  it('envia a credencial detectada pela câmera para a validação da portaria', async () => {
    let requestBody: unknown;
    scannerMock.decodeFromVideoDevice.mockImplementation(
      async (
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
      http.get(`${apiUrl}/gate/events`, () => HttpResponse.json(gateEvents)),
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
    server.use(http.get(`${apiUrl}/gate/events`, () => HttpResponse.json(gateEvents)));
    const user = userEvent.setup();

    renderGate('/gate/events/event-1');

    await user.click(await screen.findByRole('button', { name: 'Ativar câmera' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Não foi possível acessar a câmera. Verifique a permissão ou use o código manual.',
    );
    expect(screen.getByLabelText('Código manual')).toBeEnabled();
  });
});
