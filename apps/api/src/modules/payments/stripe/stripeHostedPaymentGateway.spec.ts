import { RefundStatus } from '../../refunds/refundStatus.enum';
import { HostedCheckoutUnavailableError } from '../errors/hostedCheckoutUnavailable.error';
import { HostedPaymentOutcomeStatus } from '../hostedPaymentOutcomeStatus.enum';
import { PaymentCurrency } from '../paymentCurrency.enum';
import { PaymentMethod } from '../paymentMethod.enum';
import { StripeHostedPaymentGateway } from './stripeHostedPaymentGateway';

describe('StripeHostedPaymentGateway', () => {
  const gateway = new StripeHostedPaymentGateway('sk_test_example');
  const payment = {
    paymentId: 'payment-local',
    amountCents: 500,
    currency: PaymentCurrency.Brl,
    method: PaymentMethod.Pix,
  };
  const session = {
    object: 'checkout.session',
    id: 'cs_test_example',
    livemode: false,
    mode: 'payment',
    status: 'open',
    payment_status: 'unpaid',
    payment_method_types: ['pix'],
    client_reference_id: payment.paymentId,
    amount_total: payment.amountCents,
    currency: 'brl',
    url: 'https://checkout.stripe.com/c/pay/cs_test_example',
  };
  const returnUrl = 'http://localhost:5173/customer/reservations/reservation-local';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deriva a chave e o vínculo externo da identidade da tentativa local', async () => {
    const fetchSession = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(session));

    await expect(gateway.createCheckout(payment, returnUrl)).resolves.toEqual({
      externalReference: session.id,
      checkoutUrl: session.url,
    });
    const [, init] = fetchSession.mock.calls[0];
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(`checkout-${payment.paymentId}`);
    expect(Object.fromEntries(init?.body as URLSearchParams)).toMatchObject({
      client_reference_id: payment.paymentId,
      'allowed_payment_method_types[0]': 'pix',
      'line_items[0][price_data][unit_amount]': '500',
      success_url: returnUrl,
    });
  });

  it.each([
    { livemode: true },
    { id: 'cs_test_other' },
    { client_reference_id: 'other-payment' },
    { amount_total: 499 },
    { currency: 'usd' },
    { payment_method_types: ['card'] },
    { url: 'https://checkout.stripe.com.example.org/c/pay/cs_test_example' },
  ])('rejeita resposta externa divergente %o', async (mismatch) => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ ...session, ...mismatch }));
    await expect(gateway.retrieveCheckout(payment, session.id)).rejects.toBeInstanceOf(
      HostedCheckoutUnavailableError,
    );
  });

  it('recupera uma sessão concluída sem devolver um link de pagamento', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        ...session,
        status: 'complete',
        payment_status: 'paid',
        url: null,
      }),
    );
    await expect(gateway.retrieveCheckout(payment, session.id)).resolves.toEqual({
      externalReference: session.id,
      checkoutUrl: null,
    });
  });

  const paidIntent = {
    id: 'pi_test_example',
    object: 'payment_intent',
    livemode: false,
    status: 'succeeded',
    amount: payment.amountCents,
    amount_received: payment.amountCents,
    currency: 'brl',
    metadata: { paymentId: payment.paymentId },
  };

  it('reconhece cobrança apenas após validar o PaymentIntent expandido', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        ...session,
        status: 'complete',
        payment_status: 'paid',
        payment_intent: paidIntent,
      }),
    );
    await expect(gateway.retrievePaymentOutcome(payment, session.id)).resolves.toEqual({
      status: HostedPaymentOutcomeStatus.Paid,
      externalPaymentReference: paidIntent.id,
    });
    expect(new URL(String(fetchSpy.mock.calls[0][0])).searchParams.get('expand[]')).toBe(
      'payment_intent',
    );
  });

  it.each([
    { livemode: true },
    { amount: 1 },
    { amount_received: 1 },
    { currency: 'usd' },
    { status: 'processing' },
    { metadata: { paymentId: 'different-attempt' } },
  ])('rejeita PaymentIntent divergente (%j)', async (mismatch) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        ...session,
        status: 'complete',
        payment_status: 'paid',
        payment_intent: { ...paidIntent, ...mismatch },
      }),
    );
    await expect(gateway.retrievePaymentOutcome(payment, session.id)).rejects.toBeInstanceOf(
      HostedCheckoutUnavailableError,
    );
  });

  it('mantém PIX não pago em aberto e encerra somente a sessão que não pode mais cobrar', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          ...session,
          status: 'complete',
          payment_intent: { ...paidIntent, status: 'processing' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...session,
          status: 'expired',
          payment_intent: { ...paidIntent, status: 'canceled', amount_received: 0 },
        }),
      );
    await expect(gateway.retrievePaymentOutcome(payment, session.id)).resolves.toEqual({
      status: HostedPaymentOutcomeStatus.Pending,
      canExpire: false,
    });
    await expect(gateway.retrievePaymentOutcome(payment, session.id)).resolves.toEqual({
      status: HostedPaymentOutcomeStatus.Closed,
    });
  });

  it.each(['complete', 'expired'])(
    'encerra sessão %s cujo PaymentIntent precisa de outro meio de pagamento e não foi cobrado',
    async (status) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        Response.json({
          ...session,
          status,
          payment_intent: { ...paidIntent, status: 'requires_payment_method', amount_received: 0 },
        }),
      );

      await expect(gateway.retrievePaymentOutcome(payment, session.id)).resolves.toEqual({
        status: HostedPaymentOutcomeStatus.Closed,
      });
    },
  );

  it.each([
    { status: 'open', intent: { amount_received: 0 } },
    { status: 'complete', intent: { amount_received: 0, amount: 1 } },
    { status: 'complete', intent: { amount_received: 1 } },
  ])(
    'mantém sessão em conciliação quando não há encerramento seguro (%j)',
    async ({ status, intent }) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        Response.json({
          ...session,
          status,
          payment_intent: { ...paidIntent, status: 'requires_payment_method', ...intent },
        }),
      );

      await expect(gateway.retrievePaymentOutcome(payment, session.id)).resolves.toEqual({
        status: HostedPaymentOutcomeStatus.Pending,
        canExpire: status === 'open',
      });
    },
  );

  it('consulta o pagamento após a Stripe recusar expiração concorrente com uma cobrança', async () => {
    const fetchStripe = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(
        Response.json({
          ...session,
          status: 'complete',
          payment_status: 'paid',
          payment_intent: paidIntent,
        }),
      );
    await expect(gateway.expireCheckout(payment, session.id)).resolves.toEqual({
      status: HostedPaymentOutcomeStatus.Paid,
      externalPaymentReference: paidIntent.id,
    });
    expect(fetchStripe.mock.calls[0]).toEqual([
      expect.stringMatching(/\/expire$/),
      expect.objectContaining({ method: 'POST' }),
    ]);
    expect(new URL(String(fetchStripe.mock.calls[1][0])).searchParams.get('expand[]')).toBe(
      'payment_intent',
    );
  });

  const refundRequest = {
    refundId: 'refund-local',
    externalPaymentReference: paidIntent.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
  };
  const stripeRefund = {
    object: 'refund',
    id: 're_fixture',
    payment_intent: paidIntent.id,
    metadata: { refundId: refundRequest.refundId },
    amount: payment.amountCents,
    currency: 'brl',
    status: 'pending',
  };

  it.each(['re_fixture', 'pyr_fixture'])(
    'solicita estorno integral %s com chave e metadado da intenção',
    async (id) => {
      const submissionStartedAt = new Date('2026-11-26T00:00:00.000Z');
      const fetchStripe = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({ ...stripeRefund, id }));
      await expect(gateway.createRefund(refundRequest, submissionStartedAt)).resolves.toEqual({
        externalReference: id,
        status: RefundStatus.Pending,
      });
      const [, init] = fetchStripe.mock.calls[0];
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(
        `refund-${refundRequest.refundId}-${submissionStartedAt.getTime()}`,
      );
      expect(Object.fromEntries(init?.body as URLSearchParams)).toMatchObject({
        payment_intent: paidIntent.id,
        amount: String(refundRequest.amountCents),
        'metadata[refundId]': refundRequest.refundId,
      });
    },
  );

  it('recupera estorno pela cobrança e pelo metadado estável mesmo após a primeira página', async () => {
    const fetchStripe = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          object: 'list',
          has_more: true,
          data: [{ ...stripeRefund, id: 'pyr_another', metadata: { refundId: 'another' } }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          object: 'list',
          has_more: false,
          data: [{ ...stripeRefund, id: 'pyr_fixture', status: 'succeeded' }],
        }),
      );
    await expect(gateway.findRefund(refundRequest)).resolves.toEqual({
      externalReference: 'pyr_fixture',
      status: RefundStatus.Completed,
    });
    expect(new URL(String(fetchStripe.mock.calls[0][0])).searchParams.get('payment_intent')).toBe(
      paidIntent.id,
    );
    expect(new URL(String(fetchStripe.mock.calls[1][0])).searchParams.get('starting_after')).toBe(
      'pyr_another',
    );
  });

  it('consulta diretamente o estorno PIX vinculado', async () => {
    const id = 'pyr_fixture';
    const fetchStripe = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ ...stripeRefund, id, status: 'succeeded' }));
    await expect(gateway.retrieveRefund(refundRequest, id)).resolves.toEqual({
      externalReference: id,
      status: RefundStatus.Completed,
    });
    expect(fetchStripe.mock.calls[0][0]).toEqual(expect.stringMatching(/\/refunds\/pyr_fixture$/));
  });

  it.each([
    { amount: 1 },
    { currency: 'usd' },
    { payment_intent: 'pi_different' },
    { id: 're_wrong' },
    { metadata: { refundId: 'different' } },
    { livemode: true },
  ])('rejeita a confirmação de estorno divergente (%j)', async (mismatch) => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ ...stripeRefund, status: 'succeeded', ...mismatch }));
    await expect(gateway.retrieveRefund(refundRequest, stripeRefund.id)).rejects.toBeInstanceOf(
      HostedCheckoutUnavailableError,
    );
  });

  it.each([
    ['succeeded', RefundStatus.Completed],
    ['failed', RefundStatus.Failed],
    ['canceled', RefundStatus.Failed],
    ['requires_action', RefundStatus.Pending],
  ])('mapeia o estorno Stripe %s para %s', async (status, expected) => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ ...stripeRefund, status }));
    await expect(gateway.retrieveRefund(refundRequest, stripeRefund.id)).resolves.toEqual({
      externalReference: stripeRefund.id,
      status: expected,
    });
  });
});
