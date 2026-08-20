import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { SessionUser, UserRole } from './features/auth/types';
import { server } from './test/server';

const apiUrl = 'http://api.test';

/** Renderiza a aplicação com instâncias isoladas de cache e roteamento para cada cenário. */
function renderApp(initialPath = '/', sessionUser?: SessionUser) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  if (sessionUser) {
    queryClient.setQueryData(['auth', 'session'], sessionUser);
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('fluxo de autenticação', () => {
  it('restaura a sessão ao iniciar e apresenta somente id e perfil', async () => {
    server.use(
      http.get(`${apiUrl}/auth/session`, () =>
        HttpResponse.json({ id: 'user-1', role: UserRole.Customer }),
      ),
    );

    renderApp();

    expect(await screen.findByText('Sessão autenticada.')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    expect(screen.getByText('CUSTOMER')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('redireciona para o login quando a sessão não existe', async () => {
    server.use(http.get(`${apiUrl}/auth/session`, () => new HttpResponse(null, { status: 204 })));

    renderApp();

    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
  });

  it('não interpreta uma falha técnica como logout', async () => {
    server.use(http.get(`${apiUrl}/auth/session`, () => new HttpResponse(null, { status: 500 })));

    renderApp();

    expect(
      await screen.findByText(
        'Não foi possível consultar sua sessão. Tente novamente em instantes.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bem-vindo de volta' })).not.toBeInTheDocument();
  });

  it('valida payload vazio antes de chamar a API', async () => {
    const loginHandler = vi.fn();
    server.use(
      http.post(`${apiUrl}/auth/login`, () => {
        loginHandler();
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();

    renderApp('/login');
    await screen.findByRole('heading', { name: 'Bem-vindo de volta' });
    const loginButton = screen.getByRole('button', { name: 'Entrar' });
    expect(loginButton).toBeDisabled();

    await user.type(screen.getByLabelText('E-mail'), 'invalid-email');
    await user.type(screen.getByLabelText('Senha'), 'password');
    await user.clear(screen.getByLabelText('Senha'));

    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
    expect(screen.getByText('Senha é obrigatória')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-describedby', 'email-error');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-describedby', 'password-error');
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(loginButton).toBeDisabled();
    expect(loginHandler).not.toHaveBeenCalled();
  });

  it('mantém neutra a mensagem de credenciais inválidas', async () => {
    server.use(http.post(`${apiUrl}/auth/login`, () => new HttpResponse(null, { status: 401 })));
    const user = userEvent.setup();

    renderApp('/login');
    await user.type(await screen.findByLabelText('E-mail'), 'unknown@example.com');
    await user.type(screen.getByLabelText('Senha'), 'incorrect');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it('autentica, preserva a sessão na navegação e não armazena o token', async () => {
    const localStorageSpy = vi.spyOn(window.localStorage, 'setItem');
    const sessionStorageSpy = vi.spyOn(window.sessionStorage, 'setItem');
    server.use(
      http.post(`${apiUrl}/auth/login`, () =>
        HttpResponse.json({
          id: 'user-2',
          email: 'customer.one.demo@ntq.local',
          role: UserRole.Customer,
        }),
      ),
    );
    const user = userEvent.setup();

    renderApp('/login');
    await user.type(await screen.findByLabelText('E-mail'), 'customer.one.demo@ntq.local');
    await user.type(screen.getByLabelText('Senha'), 'demo-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Sessão autenticada.')).toBeInTheDocument();
    expect(screen.getByText('user-2')).toBeInTheDocument();
    expect(screen.queryByText('customer.one.demo@ntq.local')).not.toBeInTheDocument();
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(sessionStorageSpy).not.toHaveBeenCalled();
  });

  it('preenche as credenciais públicas pelo acesso rápido', async () => {
    const user = userEvent.setup();

    renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Cliente' }));

    expect(screen.getByLabelText('E-mail')).toHaveValue('customer.one.demo@ntq.local');
    expect(screen.getByLabelText('Senha')).toHaveValue('demo-password');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('não consulta a sessão ao acessar diretamente a página pública de login', async () => {
    const sessionHandler = vi.fn();
    server.use(
      http.get(`${apiUrl}/auth/session`, () => {
        sessionHandler();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(sessionHandler).not.toHaveBeenCalled();
  });

  it('redireciona do login quando a sessão já está conhecida no cache', async () => {
    renderApp('/login', { id: 'user-4', role: UserRole.Gate });

    expect(await screen.findByText('Sessão autenticada.')).toBeInTheDocument();
    expect(screen.getByText(UserRole.Gate)).toBeInTheDocument();
  });

  it('encerra a sessão e retorna ao login', async () => {
    server.use(
      http.get(`${apiUrl}/auth/session`, () =>
        HttpResponse.json({ id: 'user-3', role: UserRole.Organizer }),
      ),
      http.post(`${apiUrl}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();

    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
  });
});
