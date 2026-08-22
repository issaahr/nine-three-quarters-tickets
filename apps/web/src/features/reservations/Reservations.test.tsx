import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const payButtonName = /Pagar R\$\s*51,80/;

function createPaymentResponse(status: 'APPROVED' | 'DECLINED' | 'FAILED') {
  return {
    id: 'payment-1',
    reservationId,
    method: 'CARD',
    status,
    amountCents: 5180,
    approvedAt: status === 'APPROVED' ? '2030-08-01T12:00:00.000Z' : null,
    failedAt: status === 'FAILED' ? '2030-08-01T12:00:00.000Z' : null,
  };
}

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

  it('envia o cartão aprovado e apresenta a confirmação sem depender de nova navegação', async () => {
    const user = userEvent.setup();
    const idempotencyKeys: string[] = [];
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
      http.post(`${apiUrl}/reservations/${reservationId}/payments/card`, async ({ request }) => {
        idempotencyKeys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json(createPaymentResponse('APPROVED'));
      }),
    );

    renderCheckout();

    await user.click(await screen.findByRole('button', { name: 'Usar cartão aprovado' }));
    await user.click(screen.getByRole('button', { name: payButtonName }));

    expect(
      await screen.findByRole('heading', { name: 'Pagamento confirmado' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('ingressos individuais foram emitidos');
    expect(idempotencyKeys).toHaveLength(1);
    expect(idempotencyKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('mantém a Reservation ativa após recusa e permite uma nova tentativa', async () => {
    const user = userEvent.setup();
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
      http.post(`${apiUrl}/reservations/${reservationId}/payments/card`, () =>
        HttpResponse.json(createPaymentResponse('DECLINED')),
      ),
    );

    renderCheckout();

    await user.click(await screen.findByRole('button', { name: 'Usar cartão recusado' }));
    await user.click(screen.getByRole('button', { name: payButtonName }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pagamento recusado');
    expect(
      screen.getByRole('heading', { name: 'Sua reserva está em andamento' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: payButtonName })).toBeEnabled();
  });

  it('ignora double-click enquanto a mutation de pagamento está em andamento', async () => {
    const user = userEvent.setup();
    let paymentCalls = 0;
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
      http.post(`${apiUrl}/reservations/${reservationId}/payments/card`, async () => {
        paymentCalls += 1;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
        return HttpResponse.json(createPaymentResponse('APPROVED'));
      }),
    );

    renderCheckout();

    await user.dblClick(await screen.findByRole('button', { name: payButtonName }));

    expect(
      await screen.findByRole('heading', { name: 'Pagamento confirmado' }),
    ).toBeInTheDocument();
    expect(paymentCalls).toBe(1);
  });

  it('reutiliza a idempotency key após uma falha técnica de rede', async () => {
    const user = userEvent.setup();
    const idempotencyKeys: string[] = [];
    let attempts = 0;
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
      http.post(`${apiUrl}/reservations/${reservationId}/payments/card`, async ({ request }) => {
        attempts += 1;
        idempotencyKeys.push(request.headers.get('Idempotency-Key') ?? '');

        return attempts === 1
          ? HttpResponse.error()
          : HttpResponse.json(createPaymentResponse('APPROVED'));
      }),
    );

    renderCheckout();

    const submitButton = await screen.findByRole('button', { name: payButtonName });
    await user.click(submitButton);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir o pagamento',
    );
    await user.click(screen.getByRole('button', { name: payButtonName }));

    expect(
      await screen.findByRole('heading', { name: 'Pagamento confirmado' }),
    ).toBeInTheDocument();
    expect(idempotencyKeys).toHaveLength(2);
    expect(idempotencyKeys[0]).toBe(idempotencyKeys[1]);
  });

  it('confirma o cancelamento e atualiza a tela da Reservation', async () => {
    const user = userEvent.setup();
    let cancellationCalls = 0;
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
      http.post(`${apiUrl}/reservations/${reservationId}/cancel`, () => {
        cancellationCalls += 1;
        return HttpResponse.json({
          id: reservationId,
          eventId,
          status: 'CANCELLED',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          confirmedAt: null,
          cancelledAt: '2030-08-01T12:00:00.000Z',
          items: reservationItems,
        });
      }),
    );

    renderCheckout();

    await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    expect(screen.getByRole('alert')).toHaveTextContent('libera os assentos imediatamente');
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    expect(
      await screen.findByRole('heading', { name: 'Sua reserva foi cancelada' }),
    ).toBeInTheDocument();
    expect(cancellationCalls).toBe(1);
  });
});
