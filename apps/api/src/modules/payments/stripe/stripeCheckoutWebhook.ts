import { createHmac, timingSafeEqual } from 'node:crypto';

import { isUUID } from 'class-validator';

import { InvalidStripeWebhookError } from '../errors/invalidStripeWebhook.error';
import {
  stripeTestSessionIdPrefix,
  stripeWebhookTimestampToleranceSeconds,
} from './stripeCheckout.constants';
import { StripeCheckoutEventType, StripeCheckoutObject } from './stripeCheckout.enums';
import { StripeCheckoutNotification } from './stripeCheckout.interfaces';

const stripeCheckoutEvents = new Set<string>(Object.values(StripeCheckoutEventType));

export class StripeCheckoutWebhook {
  public constructor(private readonly secret: string) {}

  /**
   * Autentica os bytes recebidos antes de interpretar o evento.
   * O conteúdo assinado indica qual sessão consultar, sem comprovar o resultado da cobrança.
   */
  public parse(
    payload: Buffer | undefined,
    signature: string | string[] | undefined,
  ): StripeCheckoutNotification | null {
    if (!payload || typeof signature !== 'string' || !this.hasValidSignature(payload, signature)) {
      throw new InvalidStripeWebhookError();
    }

    let notification: unknown;
    try {
      notification = JSON.parse(payload.toString('utf8'));
    } catch {
      throw new InvalidStripeWebhookError();
    }

    const event = this.record(notification);
    if (!event || event.livemode !== false || typeof event.type !== 'string')
      throw new InvalidStripeWebhookError();
    if (!stripeCheckoutEvents.has(event.type)) return null;

    const session = this.record(this.record(event.data)?.object);
    if (
      !session ||
      session.object !== StripeCheckoutObject.Session ||
      session.livemode !== false ||
      typeof session.id !== 'string' ||
      !session.id.startsWith(stripeTestSessionIdPrefix)
    ) {
      throw new InvalidStripeWebhookError();
    }
    const paymentId = session.client_reference_id;
    if (typeof paymentId !== 'string' || !isUUID(paymentId)) return null;
    return { paymentId, externalReference: session.id };
  }

  /** A janela da assinatura segue o relógio do servidor, independente do prazo de compra do PostgreSQL. */
  private hasValidSignature(payload: Buffer, signature: string): boolean {
    const elements = signature.split(',').map((value) => value.trim());
    const timestamps = elements.filter((value) => /^t=\d+$/.test(value));
    if (timestamps.length !== 1) return false;
    const timestamp = timestamps[0].slice(2);
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (ageSeconds > stripeWebhookTimestampToleranceSeconds) return false;

    const expected = createHmac('sha256', this.secret)
      .update(`${timestamp}.`)
      .update(payload)
      .digest();
    // Compara todas as assinaturas v1 válidas em formato, incluindo as presentes durante rotação.
    return elements
      .filter((value) => /^v1=[a-fA-F0-9]{64}$/.test(value))
      .some((value) => timingSafeEqual(expected, Buffer.from(value.slice(3), 'hex')));
  }

  private record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }
}
