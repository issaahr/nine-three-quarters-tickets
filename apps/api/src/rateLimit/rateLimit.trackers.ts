import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGetTrackerFunction } from '@nestjs/throttler';

import { RateLimitRequest } from './rateLimit.interfaces';

function asRateLimitRequest(request: Record<string, unknown>): RateLimitRequest {
  return request as RateLimitRequest;
}

function getRequestIp(request: RateLimitRequest): string {
  return request.ip?.trim() || 'unknown';
}

function buildIpTracker(request: Record<string, unknown>): string {
  return `ip:${getRequestIp(asRateLimitRequest(request))}`;
}

/** Usa somente o IP calculado pelo Express após a aplicação da política de proxies confiáveis. */
export const trackAuthRequest: ThrottlerGetTrackerFunction = (request) => buildIpTracker(request);

/** Compartilha o limite externo por usuário, recorrendo ao IP antes da autenticação. */
export const trackCatalogRequest: ThrottlerGetTrackerFunction = (request) => {
  const typedRequest = asRateLimitRequest(request);
  return typedRequest.user ? `user:${typedRequest.user.id}` : buildIpTracker(request);
};

/** Impede que operador ou origem isoladamente contornem o limite do código manual. */
export const trackManualCheckInRequest: ThrottlerGetTrackerFunction = (request) => {
  const typedRequest = asRateLimitRequest(request);
  const operator = typedRequest.user ? `operator:${typedRequest.user.id}` : 'operator:unknown';
  return `${operator}:${buildIpTracker(request)}`;
};

/** Mantém um único bucket por política em vez de multiplicá-lo por endpoint. */
export function generateRateLimitKey(
  _context: ExecutionContext,
  tracker: string,
  policy: string,
): string {
  return `${policy}:${tracker}`;
}
