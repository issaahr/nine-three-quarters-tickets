import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { UserRole } from '../auth/types';
import { AdmissionMode, EventCategory, EventStatus } from '../events/types';
import { navigateToHostedCheckout } from '../payments/hostedCheckoutNavigation';
import {
  HostedCheckoutPayment,
  PaymentCheckoutMode,
  PaymentMethod,
  PaymentStatus,
  SimulatedPixPayment,
} from '../payments/types';
import { server } from '@/test/server';

const apiUrl = 'http://api.test';
const reservationId = 'reservation-checkout';
const eventId = 'event-checkout';
const pixPath = `${apiUrl}/reservations/${reservationId}/payments/pix`;
const hostedPath = `${apiUrl}/reservations/${reservationId}/payments/hosted`;
const configurationPath = `${apiUrl}/payments/configuration`;
const checkoutUrl = 'https://checkout.stripe.com/fixture';

vi.mock('../payments/hostedCheckoutNavigation', () => ({ navigateToHostedCheckout: vi.fn() }));
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

const pendingPix: SimulatedPixPayment = {
  id: 'pix-1',
  reservationId,
  method: PaymentMethod.Pix,
  status: PaymentStatus.Pending,
  amountCents: 5180,
  approvedAt: null,
  failedAt: null,
  simulationCompletionAt: '2099-08-01T12:00:00.000Z',
  qrCodePayload: 'ntq:pix:simulado:pix-1',
};

function mockReservationStatus(getStatus: () => 'ACTIVE' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED') {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  server.use(
    http.get(`${apiUrl}/reservations/${reservationId}`, () => {
      const status = getStatus();
      return HttpResponse.json({
        id: reservationId,
        eventId,
        status,
        expiresAt,
        confirmedAt: status === 'CONFIRMED' ? '2030-08-01T12:00:00.000Z' : null,
        cancelledAt: status === 'CANCELLED' ? '2030-08-01T12:00:00.000Z' : null,
        items: reservationItems,
      });
    }),
  );
}

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

function renderCheckout(search = '') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(['auth', 'session'], {
    id: 'customer-1',
    role: UserRole.Customer,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/customer/reservations/${reservationId}${search}`]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function findReadyCardPayButton() {
  const button = await screen.findByRole('button', { name: payButtonName });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

beforeEach(() => {
  vi.mocked(navigateToHostedCheckout).mockClear();
  server.use(
    http.get(configurationPath, () =>
      HttpResponse.json({
        mode: PaymentCheckoutMode.Simulated,
        methods: [PaymentMethod.Card, PaymentMethod.Pix],
      }),
    ),
    http.get(pixPath, () => HttpResponse.json({ code: 'PAYMENT_NOT_FOUND' }, { status: 404 })),
    http.get(`${apiUrl}/events/${eventId}`, () => HttpResponse.json(eventDetail)),
    http.get(`${apiUrl}/events/${eventId}/seats`, () =>
      HttpResponse.json([
        { id: 'event-seat-1', label: 'A1', row: 'A', number: 1, x: 0, y: 0, status: 'HELD' },
        { id: 'event-seat-2', label: 'A2', row: 'A', number: 2, x: 1, y: 0, status: 'HELD' },
      ]),
    ),
  );
});

describe('checkout hospedado', () => {
  const initialMessage = 'Você será redirecionado ao checkout seguro para concluir o pagamento.';
  const preparingMessage = 'Preparando seu pagamento…';
  const resumeMessage =
    'Você tem um pagamento em andamento. Clique em “Retomar pagamento” para continuar.';
  const waitingMessage = 'Aguardando confirmação do pagamento.';
  const pendingPayment: HostedCheckoutPayment = {
    id: 'hosted-payment',
    method: PaymentMethod.Pix,
    reservationId,
    status: PaymentStatus.Pending,
    amountCents: 5180,
    approvedAt: null,
    failedAt: null,
    checkoutUrl: null,
    canResume: false,
  };

  function enableHosted(methods = [PaymentMethod.Card, PaymentMethod.Pix]) {
    server.use(
      http.get(configurationPath, () =>
        HttpResponse.json({ mode: PaymentCheckoutMode.Hosted, methods }),
      ),
    );
  }

  beforeEach(() => {
    enableHosted();
    mockReservationStatus(() => 'ACTIVE');
  });

  it.each([
    { method: PaymentMethod.Card, label: 'Cartão de crédito', otherLabel: 'Pix' },
    { method: PaymentMethod.Pix, label: 'Pix', otherLabel: 'Cartão de crédito' },
  ])(
    'mostra o estado inicial e o preparo ao abrir o checkout de $label',
    async ({ method, label, otherLabel }) => {
      enableHosted([method]);
      const starts: Array<{ body: unknown; key: string | null }> = [];
      let finishRequest!: () => void;
      const pendingRequest = new Promise<void>((resolve) => {
        finishRequest = resolve;
      });
      server.use(
        http.get(hostedPath, () =>
          HttpResponse.json({ code: 'PAYMENT_NOT_FOUND' }, { status: 404 }),
        ),
        http.post(hostedPath, async ({ request }) => {
          starts.push({ body: await request.json(), key: request.headers.get('idempotency-key') });
          await pendingRequest;
          return HttpResponse.json({ ...pendingPayment, checkoutUrl, method });
        }),
      );

      renderCheckout();
      const action = await screen.findByRole('button', { name: 'Ir para o pagamento' });
      await waitFor(() => expect(action).toBeEnabled());
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: otherLabel })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByRole('timer', { name: 'Tempo restante da reserva' })).toBeInTheDocument();
      expect(screen.getByText(initialMessage)).toBeInTheDocument();
      expect(screen.queryByText(resumeMessage)).not.toBeInTheDocument();

      try {
        await userEvent.dblClick(action);
        expect(await screen.findByText(preparingMessage)).toHaveAttribute('role', 'status');
        expect(action).toBeDisabled();
        expect(screen.queryByText(initialMessage)).not.toBeInTheDocument();
        expect(screen.queryByText(resumeMessage)).not.toBeInTheDocument();
        expect(screen.queryByText(waitingMessage)).not.toBeInTheDocument();
      } finally {
        finishRequest();
      }
      await waitFor(() => expect(navigateToHostedCheckout).toHaveBeenCalledWith(checkoutUrl));
      expect(starts).toEqual([{ body: { method }, key: expect.any(String) }]);
    },
  );

  it('retoma a tentativa órfã do GET usando o ID local e sem iniciar outro pagamento', async () => {
    const start = vi.fn();
    const resume = vi.fn();
    server.use(
      http.get(hostedPath, () => HttpResponse.json({ ...pendingPayment, canResume: true })),
      http.post(hostedPath, () => {
        start();
        return new HttpResponse(null, { status: 500 });
      }),
      http.post(`${hostedPath}/${pendingPayment.id}/resume`, () => {
        resume();
        return HttpResponse.json({ ...pendingPayment, checkoutUrl });
      }),
    );

    renderCheckout('?status=paid&paymentId=unauthorized');
    const action = await screen.findByRole('button', { name: 'Retomar pagamento' });
    expect(navigateToHostedCheckout).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(screen.queryByText('Pagamento confirmado')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pix' })).toBeDisabled();
    expect(screen.getByText(resumeMessage)).toHaveAttribute('role', 'status');
    expect(screen.queryByText(initialMessage)).not.toBeInTheDocument();
    expect(screen.queryByText(waitingMessage)).not.toBeInTheDocument();
    await userEvent.click(action);

    await waitFor(() => expect(navigateToHostedCheckout).toHaveBeenCalledWith(checkoutUrl));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('reabre a sessão existente somente com a URL revalidada pela API', async () => {
    const currentUrl = 'https://checkout.stripe.com/revalidated';
    server.use(
      http.get(hostedPath, () => HttpResponse.json({ ...pendingPayment, checkoutUrl })),
      http.post(`${hostedPath}/${pendingPayment.id}/resume`, () =>
        HttpResponse.json({ ...pendingPayment, checkoutUrl: currentUrl }),
      ),
    );

    const initialVisit = renderCheckout();
    await screen.findByText(resumeMessage);
    initialVisit.unmount();

    renderCheckout('?status=paid');
    const action = await screen.findByRole('button', { name: 'Retomar pagamento' });
    expect(screen.getByText(resumeMessage)).toHaveAttribute('role', 'status');
    expect(screen.queryByText(initialMessage)).not.toBeInTheDocument();
    expect(screen.queryByText(preparingMessage)).not.toBeInTheDocument();
    expect(screen.queryByText(waitingMessage)).not.toBeInTheDocument();

    expect(navigateToHostedCheckout).not.toHaveBeenCalled();
    await userEvent.click(action);
    await waitFor(() =>
      expect(navigateToHostedCheckout).toHaveBeenCalledExactlyOnceWith(currentUrl),
    );
  });

  it('descarta a URL anterior se o hold expirar antes de retomar a sessão', async () => {
    let isExpired = false;
    mockReservationStatus(() => (isExpired ? 'EXPIRED' : 'ACTIVE'));
    server.use(
      http.get(hostedPath, () => HttpResponse.json({ ...pendingPayment, checkoutUrl })),
      http.post(`${hostedPath}/${pendingPayment.id}/resume`, () => {
        isExpired = true;
        return HttpResponse.json(pendingPayment);
      }),
    );

    renderCheckout();
    await userEvent.click(await screen.findByRole('button', { name: 'Retomar pagamento' }));

    expect(await screen.findByRole('heading', { name: 'Sua reserva expirou' })).toBeInTheDocument();
    expect(navigateToHostedCheckout).not.toHaveBeenCalled();
  });

  it('aguarda uma sessão fechada e exibe ingressos somente após a confirmação da API', async () => {
    let approved = false;
    mockReservationStatus(() => (approved ? 'CONFIRMED' : 'ACTIVE'));
    server.use(
      http.get(hostedPath, () =>
        HttpResponse.json(
          approved
            ? {
                ...pendingPayment,
                status: PaymentStatus.Approved,
                approvedAt: '2030-08-01T12:00:00.000Z',
              }
            : pendingPayment,
        ),
      ),
    );

    renderCheckout('?status=paid');
    expect(await screen.findByText(waitingMessage)).toHaveAttribute('role', 'status');
    expect(screen.queryByText(initialMessage)).not.toBeInTheDocument();
    expect(screen.queryByText(resumeMessage)).not.toBeInTheDocument();
    expect(screen.queryByText(preparingMessage)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retomar pagamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver meus ingressos' })).not.toBeInTheDocument();
    approved = true;
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar situação do pagamento' }));

    expect(
      await screen.findByRole('heading', { name: 'Pagamento confirmado' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver meus ingressos' })).toBeInTheDocument();
    expect(navigateToHostedCheckout).not.toHaveBeenCalled();
  });

  it('prioriza a espera informada pela API após uma falha anterior de navegação', async () => {
    let hasOpenSession = true;
    const navigationError = 'Não foi possível abrir o checkout. Tente novamente.';
    vi.mocked(navigateToHostedCheckout).mockImplementationOnce(() => {
      throw new Error('Navegação indisponível');
    });
    server.use(
      http.get(hostedPath, () =>
        HttpResponse.json({ ...pendingPayment, checkoutUrl: hasOpenSession ? checkoutUrl : null }),
      ),
      http.post(`${hostedPath}/${pendingPayment.id}/resume`, () =>
        HttpResponse.json({ ...pendingPayment, checkoutUrl }),
      ),
    );

    renderCheckout();
    await userEvent.click(await screen.findByRole('button', { name: 'Retomar pagamento' }));
    expect(await screen.findByText(navigationError)).toHaveAttribute('role', 'alert');

    hasOpenSession = false;
    // O TanStack Query consulta novamente ao voltar o foco para a página.
    window.dispatchEvent(new Event('visibilitychange'));

    expect(await screen.findByText(waitingMessage)).toHaveAttribute('role', 'status');
    expect(screen.queryByText(navigationError)).not.toBeInTheDocument();
    expect(screen.queryByText(resumeMessage)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar situação do pagamento' })).toBeEnabled();
  });

  it('reutiliza a chave e mantém o método após uma falha de transporte sem tentativa encontrada', async () => {
    const attempts: Array<{ method: PaymentMethod; key: string | null }> = [];
    server.use(
      http.get(hostedPath, () => HttpResponse.json({ code: 'PAYMENT_NOT_FOUND' }, { status: 404 })),
      http.post(hostedPath, async ({ request }) => {
        const { method } = (await request.json()) as { method: PaymentMethod };
        attempts.push({ method, key: request.headers.get('idempotency-key') });
        return attempts.length === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ ...pendingPayment, method, checkoutUrl });
      }),
    );

    renderCheckout();
    const action = await screen.findByRole('button', { name: 'Ir para o pagamento' });
    await waitFor(() => expect(action).toBeEnabled());
    await userEvent.click(action);
    expect(
      await screen.findByText('Não foi possível abrir o checkout. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pix' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Ir para o pagamento' }));

    await waitFor(() => expect(navigateToHostedCheckout).toHaveBeenCalledWith(checkoutUrl));
    expect(attempts).toEqual([
      { method: PaymentMethod.Card, key: expect.any(String) },
      attempts[0],
    ]);
  });

  it('libera outro método após a API rejeitar definitivamente o total do Pix', async () => {
    const attempts: Array<{ method: PaymentMethod; key: string | null }> = [];
    server.use(
      http.get(hostedPath, () => HttpResponse.json({ code: 'PAYMENT_NOT_FOUND' }, { status: 404 })),
      http.post(hostedPath, async ({ request }) => {
        const { method } = (await request.json()) as { method: PaymentMethod };
        attempts.push({ method, key: request.headers.get('idempotency-key') });
        return method === PaymentMethod.Pix
          ? HttpResponse.json({ code: 'PAYMENT_AMOUNT_UNSUPPORTED' }, { status: 422 })
          : HttpResponse.json({ ...pendingPayment, method, checkoutUrl });
      }),
    );

    renderCheckout();
    const action = await screen.findByRole('button', { name: 'Ir para o pagamento' });
    await waitFor(() => expect(action).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Pix' }));
    await userEvent.click(action);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O total da reserva está fora dos limites para este método de pagamento.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cartão de crédito' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(action);

    await waitFor(() => expect(navigateToHostedCheckout).toHaveBeenCalledWith(checkoutUrl));
    expect(attempts).toEqual([
      { method: PaymentMethod.Pix, key: expect.any(String) },
      { method: PaymentMethod.Card, key: expect.any(String) },
    ]);
    expect(attempts[0].key).not.toBe(attempts[1].key);
  });

  it('permite escolher outro método após falha terminal reconhecida pela API', async () => {
    const start = vi.fn();
    server.use(
      http.get(hostedPath, () =>
        HttpResponse.json({ ...pendingPayment, status: PaymentStatus.Failed }),
      ),
      http.post(hostedPath, async ({ request }) => {
        const data = await request.json();
        start(data);
        return HttpResponse.json({ ...pendingPayment, id: 'fresh-attempt', checkoutUrl });
      }),
    );

    renderCheckout();
    expect(
      await screen.findByText('O pagamento não foi concluído. Você pode tentar novamente.'),
    ).toBeInTheDocument();
    const pix = screen.getByRole('button', { name: 'Pix' });
    expect(pix).toBeEnabled();
    await userEvent.click(pix);
    await userEvent.click(screen.getByRole('button', { name: 'Ir para o pagamento' }));

    await waitFor(() => expect(navigateToHostedCheckout).toHaveBeenCalledWith(checkoutUrl));
    expect(start).toHaveBeenCalledExactlyOnceWith({ method: PaymentMethod.Pix });
  });
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
    expect(
      screen.getByText(
        /a compra pode ser cancelada integralmente em até sete dias da aprovação do pagamento/i,
      ),
    ).toBeInTheDocument();
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
    await user.click(await findReadyCardPayButton());

    expect(
      await screen.findByRole('heading', { name: 'Pagamento confirmado' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Seus ingressos já estão disponíveis em Meus ingressos.',
    );
    expect(screen.getByRole('link', { name: 'Ver meus ingressos' })).toHaveAttribute(
      'href',
      '/customer/tickets',
    );
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
    await user.click(await findReadyCardPayButton());

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

    await user.dblClick(await findReadyCardPayButton());

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

    const submitButton = await findReadyCardPayButton();
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

describe('PIX simulado no checkout', () => {
  it('continua consultando o PIX pendente quando o cancelamento oculta o painel', async () => {
    let cancelled = false;
    const settlement = vi.fn();
    mockReservationStatus(() => (cancelled ? 'CANCELLED' : 'ACTIVE'));
    server.use(
      http.get(pixPath, () => HttpResponse.json(pendingPix)),
      http.post(`${pixPath}/${pendingPix.id}/settle`, () => {
        settlement(cancelled);
        return HttpResponse.json(
          cancelled ? { ...pendingPix, status: PaymentStatus.Failed } : pendingPix,
        );
      }),
      http.post(`${apiUrl}/reservations/${reservationId}/cancel`, () => {
        cancelled = true;
        return HttpResponse.json({
          id: reservationId,
          eventId,
          status: 'CANCELLED',
          expiresAt: new Date().toISOString(),
          confirmedAt: null,
          cancelledAt: new Date().toISOString(),
          items: reservationItems,
        });
      }),
    );

    renderCheckout();
    await screen.findByRole('img', { name: 'Código QR do PIX simulado' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    expect(
      await screen.findByRole('heading', { name: 'Sua reserva foi cancelada' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Código QR do PIX simulado' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(settlement).toHaveBeenCalledWith(true), { timeout: 4_000 });
  });

  it('gera o QR e retoma a tentativa após reload até a confirmação autoritativa', async () => {
    const user = userEvent.setup();
    let persisted: SimulatedPixPayment | null = null;
    let creationCalls = 0;
    let settlementCalls = 0;
    let reservationReads = 0;
    mockReservationStatus(() => {
      reservationReads += 1;
      return persisted?.status === PaymentStatus.Approved ? 'CONFIRMED' : 'ACTIVE';
    });
    server.use(
      http.get(pixPath, () =>
        persisted
          ? HttpResponse.json(persisted)
          : HttpResponse.json({ code: 'PAYMENT_NOT_FOUND' }, { status: 404 }),
      ),
      http.post(pixPath, () => {
        creationCalls += 1;
        persisted = pendingPix;
        return HttpResponse.json(persisted, { status: 201 });
      }),
      http.post(`${pixPath}/${pendingPix.id}/settle`, () => {
        settlementCalls += 1;
        if (settlementCalls === 2) {
          persisted = {
            ...pendingPix,
            status: PaymentStatus.Approved,
            approvedAt: '2030-08-01T12:00:00.000Z',
          };
        }
        return HttpResponse.json(persisted);
      }),
    );

    const firstCheckout = renderCheckout();
    await user.click(await screen.findByRole('button', { name: 'PIX simulado' }));
    const generateButton = screen.getByRole('button', { name: 'Gerar QR do PIX' });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);
    const firstQr = await screen.findByRole('img', { name: 'Código QR do PIX simulado' });
    firstCheckout.unmount();
    const checkoutAfterReload = renderCheckout();

    const recoveredQr = await screen.findByRole('img', { name: 'Código QR do PIX simulado' });
    expect(recoveredQr.isEqualNode(firstQr)).toBe(true);
    expect(screen.getByRole('button', { name: 'Cartão de crédito' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Gerar QR do PIX' })).not.toBeInTheDocument();
    expect(creationCalls).toBe(1);

    expect(
      await screen.findByRole('heading', { name: 'Pagamento confirmado' }, { timeout: 6_500 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver meus ingressos' })).toHaveAttribute(
      'href',
      '/customer/tickets',
    );
    expect(reservationReads).toBeGreaterThanOrEqual(3);
    expect(settlementCalls).toBe(2);
    checkoutAfterReload.unmount();
  }, 10_000);

  it('para de consultar o settlement quando a API encerra o PIX por expiração', async () => {
    let payment = pendingPix;
    let settlementCalls = 0;
    mockReservationStatus(() => (payment.status === PaymentStatus.Failed ? 'EXPIRED' : 'ACTIVE'));
    server.use(
      http.get(pixPath, () => HttpResponse.json(payment)),
      http.post(`${pixPath}/${pendingPix.id}/settle`, () => {
        settlementCalls += 1;
        payment = {
          ...pendingPix,
          status: PaymentStatus.Failed,
          failedAt: '2030-08-01T12:00:00.000Z',
        };
        return HttpResponse.json(payment);
      }),
    );

    renderCheckout();
    expect(
      await screen.findByRole('img', { name: 'Código QR do PIX simulado' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Sua reserva expirou' }, { timeout: 4_500 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Código QR do PIX simulado' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver meus ingressos' })).not.toBeInTheDocument();

    await new Promise<void>((resolve) => window.setTimeout(resolve, 2_200));
    expect(settlementCalls).toBe(1);
  }, 9_000);

  it('repete a chave de criação do PIX após falha de rede', async () => {
    const user = userEvent.setup();
    const keys: Array<string | null> = [];
    mockReservationStatus(() => 'ACTIVE');
    server.use(
      http.post(pixPath, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        return keys.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(pendingPix, { status: 201 });
      }),
    );

    renderCheckout();
    await user.click(await screen.findByRole('button', { name: 'PIX simulado' }));
    const generateButton = screen.getByRole('button', { name: 'Gerar QR do PIX' });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível iniciar o PIX');
    await user.click(generateButton);

    expect(
      await screen.findByRole('img', { name: 'Código QR do PIX simulado' }),
    ).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toEqual(expect.any(String));
    expect(keys[1]).toBe(keys[0]);
  });
});
