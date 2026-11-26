import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { AuthenticatedRequest } from '../../auth/auth.types';
import { InvalidIdempotencyKeyError } from '../errors/invalidIdempotencyKey.error';

/** Aplica o mesmo contrato de Idempotency-Key às rotas de criação de cartão e PIX. */
export const PaymentIdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { headers } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = headers['idempotency-key'];

    if (typeof key !== 'string' || !isUUID(key, '4')) {
      throw new InvalidIdempotencyKeyError();
    }

    return key;
  },
);
