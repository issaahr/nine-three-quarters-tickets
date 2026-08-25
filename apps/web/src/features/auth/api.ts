import { api } from '@/lib/api';
import {
  LoginCredentials,
  LoginResponse,
  SessionUser,
  SignupCredentials,
  SignupResponse,
} from './types';

/** Consulta a sessão sem confundir uma resposta não autenticada com uma falha técnica da API. */
export async function fetchSession(): Promise<SessionUser | null> {
  const response = await api.get<SessionUser | null>('/auth/session');
  return response.status === 204 ? null : response.data;
}

/** Autentica as credenciais; o token permanece exclusivamente no cookie HttpOnly. */
export async function loginUser(credentials: LoginCredentials): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', credentials);
  return data;
}

/** Cria uma conta CUSTOMER sem iniciar sessão automaticamente. */
export async function signupUser(credentials: SignupCredentials): Promise<SignupResponse> {
  const { data } = await api.post<SignupResponse>('/auth/signup', credentials);
  return data;
}

/** Encerra a sessão no backend, responsável por expirar o cookie de autenticação. */
export async function logoutUser(): Promise<void> {
  await api.post('/auth/logout');
}
