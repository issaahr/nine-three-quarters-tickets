import axios from 'axios';

import { environment } from '../config/environment';

export const api = axios.create({
  baseURL: environment.apiUrl,
  // Necessário para que o navegador envie o cookie HttpOnly nas requisições à API.
  withCredentials: true,
});
