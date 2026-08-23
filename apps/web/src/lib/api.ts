import axios from 'axios';

import { environment } from '../config/environment';

export const api = axios.create({
  baseURL: environment.apiUrl,
  // Necessário para que o navegador envie o cookie HttpOnly nas requisições à API.
  withCredentials: true,
});

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
