import { Injectable } from '@nestjs/common';

import {
  CardPaymentGatewayRequest,
  CardPaymentGatewayResult,
  CardPaymentGatewayStatus,
  PaymentGateway,
} from './paymentGateway.interfaces';

export const approvedCardNumber = '4242424242424242';
export const declinedCardNumber = '4000000000000002';
export const failedCardNumber = '4000000000000119';

/**
 * Erro técnico determinístico do gateway simulado.
 */
export class FakePaymentGatewayTechnicalError extends Error {
  public constructor() {
    super('Falha técnica simulada no processamento do cartão');
  }
}

/**
 * Gateway local determinístico, destinado exclusivamente à demonstração e aos testes.
 */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  public async processCard(request: CardPaymentGatewayRequest): Promise<CardPaymentGatewayResult> {
    if (request.cardNumber === failedCardNumber) {
      throw new FakePaymentGatewayTechnicalError();
    }

    if (request.cardNumber === approvedCardNumber) {
      return { status: CardPaymentGatewayStatus.Approved };
    }

    return { status: CardPaymentGatewayStatus.Declined };
  }
}
