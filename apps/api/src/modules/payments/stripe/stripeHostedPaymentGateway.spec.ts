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
      });
    },
  );
});
