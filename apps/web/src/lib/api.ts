import axios from 'axios';

import { environment } from '../config/environment';

export const api = axios.create({
  baseURL: environment.apiUrl,
  // Necessário para que o navegador envie o cookie HttpOnly nas requisições à API.
  withCredentials: true,
});

const rateLimitErrorCode = 'RATE_LIMIT_EXCEEDED';

/** Identifica somente o limite aplicado pela própria API, sem confundir falhas externas normalizadas. */
export function isApiRateLimitError(error: unknown): boolean {
  return (
    axios.isAxiosError<{ code?: string }>(error) &&
    error.response?.status === 429 &&
    error.response.data?.code === rateLimitErrorCode
  );
}

export const rateLimitErrorMessage =
  'Muitas tentativas. Aguarde um momento antes de tentar novamente.';

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !error.config?.url?.startsWith('/auth/')
    ) {
      window.dispatchEvent(new Event('session-expired'));
    }

    return Promise.reject(error);
  },
);
