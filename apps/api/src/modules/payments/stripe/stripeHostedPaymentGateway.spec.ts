import { HostedCheckoutUnavailableError } from '../errors/hostedCheckoutUnavailable.error';
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
});
