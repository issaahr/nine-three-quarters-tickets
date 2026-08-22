import {
  approvedCardNumber,
  declinedCardNumber,
  failedCardNumber,
  FakePaymentGateway,
  FakePaymentGatewayTechnicalError,
} from './fakePaymentGateway';
import { CardPaymentGatewayStatus } from './paymentGateway.interfaces';

describe('FakePaymentGateway', () => {
  const gateway = new FakePaymentGateway();
  const request = {
    cardholderName: 'Ana Beatriz Souza',
    expiry: '08/29',
    cvv: '123',
    amountCents: 2590,
  };

  it('aprova deterministicamente o cartão de demonstração aprovado', async () => {
    await expect(
      gateway.processCard({ ...request, cardNumber: approvedCardNumber }),
    ).resolves.toEqual({
      status: CardPaymentGatewayStatus.Approved,
    });
  });

  it('recusa deterministicamente cartões diferentes do preset aprovado', async () => {
    await expect(
      gateway.processCard({ ...request, cardNumber: declinedCardNumber }),
    ).resolves.toEqual({
      status: CardPaymentGatewayStatus.Declined,
    });
  });

  it('simula falha técnica com o cartão reservado para esse cenário', async () => {
    await expect(
      gateway.processCard({ ...request, cardNumber: failedCardNumber }),
    ).rejects.toBeInstanceOf(FakePaymentGatewayTechnicalError);
  });
});
