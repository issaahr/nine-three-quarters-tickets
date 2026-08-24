import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { SessionUser, UserRole } from './features/auth/types';
import { getRoleNavigation } from './features/navigation/roleNavigation';
import { server } from './test/server';

const apiUrl = 'http://api.test';

/** Renderiza a aplicação com instâncias isoladas de cache e roteamento para cada cenário. */
function renderApp(initialPath = '/', sessionUser?: SessionUser, publicSignupEnabled?: boolean) {
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
        <App publicSignupEnabled={publicSignupEnabled} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server.use(
    http.get(`${apiUrl}/organizer/me/events`, () => HttpResponse.json([])),
    http.get(`${apiUrl}/events`, () => HttpResponse.json({ items: [], page: 1, hasMore: false })),
    http.get(`${apiUrl}/gate/events`, () =>
      HttpResponse.json({ items: [], page: 1, hasMore: false }),
    ),
    http.get(`${apiUrl}/tickets`, () => HttpResponse.json([])),
  );
});

describe('fluxo de autenticação', () => {
  it('mantém a tela atual sob o modal e só abre o login após confirmação', async () => {
    const user = userEvent.setup();
    renderApp('/organizer', { id: 'organizer-1', role: UserRole.Organizer });

    expect(await screen.findByRole('heading', { name: 'Meus eventos' })).toBeInTheDocument();
    window.dispatchEvent(new Event('session-expired'));

    expect(await screen.findByRole('dialog', { name: 'Sessão expirada' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meus eventos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bem-vindo de volta' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fazer login' }));

    expect(screen.queryByRole('dialog', { name: 'Sessão expirada' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
  });

  it('restaura a sessão e direciona o cliente sem expor identificador ou email', async () => {
    server.use(
      http.get(`${apiUrl}/auth/session`, () =>
        HttpResponse.json({ id: 'user-1', role: UserRole.Customer }),
      ),
    );

    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Encontre sua próxima experiência' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('user-1')).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('oculta Eventos no header mobile do cliente autenticado', async () => {
    renderApp('/customer/tickets', { id: 'customer-1', role: UserRole.Customer });

    expect(await screen.findByRole('heading', { name: 'Meus ingressos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Eventos' })).toHaveClass('hidden', 'sm:inline-block');
    expect(screen.getByRole('link', { name: 'Meus ingressos' })).toBeInTheDocument();
  });

  it('mantém a home pública disponível quando a sessão não existe', async () => {
    server.use(http.get(`${apiUrl}/auth/session`, () => new HttpResponse(null, { status: 204 })));

    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Encontre sua próxima experiência' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
  });

  it('exibe placeholder de carregamento no header enquanto a sessão é verificada', () => {
    server.use(http.get(`${apiUrl}/auth/session`, () => new Promise(() => {})));

    renderApp();

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('não bloqueia a home pública quando a restauração da sessão falha', async () => {
    server.use(http.get(`${apiUrl}/auth/session`, () => new HttpResponse(null, { status: 500 })));

    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Encontre sua próxima experiência' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
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

  it('informa amigavelmente quando o login atinge o rate limit da API', async () => {
    server.use(
      http.post(`${apiUrl}/auth/login`, () =>
        HttpResponse.json(
          { code: 'RATE_LIMIT_EXCEEDED', message: 'detalhe interno' },
          { status: 429 },
        ),
      ),
    );
    const user = userEvent.setup();

    renderApp('/login');
    await user.type(await screen.findByLabelText('E-mail'), 'customer@example.com');
    await user.type(screen.getByLabelText('Senha'), 'valid-password');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Aguarde um momento antes de tentar novamente.',
    );
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

    expect(
      await screen.findByRole('heading', { name: 'Encontre sua próxima experiência' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('user-2')).not.toBeInTheDocument();
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

    expect(
      await screen.findByRole('heading', { name: 'Nenhum Event disponível' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Portaria').length).toBeGreaterThan(0);
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

  it('oferece e acessa o cadastro quando a flag está habilitada', async () => {
    const user = userEvent.setup();

    renderApp('/login', undefined, true);
    await user.click(await screen.findByRole('link', { name: 'Cadastre-se' }));

    expect(await screen.findByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();
  });

  it('remove o acesso e redireciona a rota de cadastro quando a flag está desabilitada', async () => {
    renderApp('/signup', undefined, false);

    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cadastre-se' })).not.toBeInTheDocument();
  });

  it('redireciona do cadastro quando a sessão já está conhecida no cache', async () => {
    renderApp('/signup', { id: 'customer-existing', role: UserRole.Customer }, true);

    expect(
      await screen.findByRole('heading', { name: 'Encontre sua próxima experiência' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Crie sua conta' })).not.toBeInTheDocument();
  });

  it('valida o cadastro antes de chamar a API e anuncia os erros', async () => {
    const signupHandler = vi.fn();
    server.use(
      http.post(`${apiUrl}/auth/signup`, () => {
        signupHandler();
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();

    renderApp('/signup', undefined, true);
    const signupButton = await screen.findByRole('button', { name: 'Criar conta' });
    expect(signupButton).toBeDisabled();

    await user.type(screen.getByLabelText('E-mail'), 'invalid-email');
    await user.type(screen.getByLabelText('Senha', { exact: true }), 'short');
    await user.type(screen.getByLabelText('Confirme a senha'), 'different');

    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
    expect(screen.getByText('A senha deve ter pelo menos 8 caracteres')).toBeInTheDocument();
    expect(screen.getByText('As senhas não coincidem')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute(
      'aria-describedby',
      'signup-email-error',
    );
    expect(screen.getByLabelText('Senha', { exact: true })).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(signupButton).toBeDisabled();
    expect(signupHandler).not.toHaveBeenCalled();
  });

  it('controla separadamente a visibilidade da senha e da confirmação', async () => {
    const user = userEvent.setup();

    renderApp('/signup', undefined, true);
    const password = await screen.findByLabelText('Senha', { exact: true });
    const passwordConfirmation = screen.getByLabelText('Confirme a senha');

    await user.click(screen.getByRole('button', { name: 'Mostrar confirmação de senha' }));

    expect(password).toHaveAttribute('type', 'password');
    expect(passwordConfirmation).toHaveAttribute('type', 'text');
    expect(
      screen.getByRole('button', { name: 'Ocultar confirmação de senha' }),
    ).toBeInTheDocument();
  });

  it('cadastra sem enviar confirmação ou role e direciona ao login', async () => {
    let requestBody: unknown;
    server.use(
      http.post(`${apiUrl}/auth/signup`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(
          {
            id: 'user-new',
            email: 'new.customer@example.com',
            role: UserRole.Customer,
          },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();

    renderApp('/signup', undefined, true);
    await user.type(await screen.findByLabelText('E-mail'), 'NEW.CUSTOMER@EXAMPLE.COM');
    await user.type(screen.getByLabelText('Senha', { exact: true }), 'valid-password');
    await user.type(screen.getByLabelText('Confirme a senha'), 'valid-password');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Conta criada. Entre com suas novas credenciais.',
    );
    expect(requestBody).toEqual({
      email: 'new.customer@example.com',
      password: 'valid-password',
    });
  });

  it('informa quando o email já está cadastrado', async () => {
    server.use(http.post(`${apiUrl}/auth/signup`, () => new HttpResponse(null, { status: 409 })));
    const user = userEvent.setup();

    renderApp('/signup', undefined, true);
    await user.type(await screen.findByLabelText('E-mail'), 'existing@example.com');
    await user.type(screen.getByLabelText('Senha', { exact: true }), 'valid-password');
    await user.type(screen.getByLabelText('Confirme a senha'), 'valid-password');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma conta com este e-mail.',
    );
  });

  it.each([
    [UserRole.Customer, 'Encontre sua próxima experiência', 'Eventos'],
    [UserRole.Organizer, 'Meus eventos', undefined],
    [UserRole.Gate, 'Nenhum Event disponível', undefined],
  ])('apresenta início e navegação coerentes para %s', async (role, heading, navigationLabel) => {
    renderApp(getRoleNavigation(role).homePath, { id: `user-${role}`, role });

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    if (navigationLabel) {
      expect(screen.getByRole('link', { name: navigationLabel })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }

    const otherNavigationLabels = ['Eventos', 'Meus eventos', 'Portaria'].filter(
      (label) => label !== navigationLabel,
    );

    for (const label of otherNavigationLabels) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it('redireciona uma tentativa de acessar a área de outro papel', async () => {
    renderApp('/organizer', { id: 'customer-forced-route', role: UserRole.Customer });

    expect(
      await screen.findByRole('heading', { name: 'Encontre sua próxima experiência' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Meus eventos' })).not.toBeInTheDocument();
  });

  it('mantém a superfície operacional da portaria separada da experiência geral', async () => {
    renderApp('/gate', { id: 'gate-operational', role: UserRole.Gate });

    await screen.findByRole('heading', { name: 'Nenhum Event disponível' });
    const main = screen.getByRole('main');

    expect(main.parentElement).toHaveClass('bg-surface-dark');
    expect(screen.getByText('Operação de portaria')).toBeInTheDocument();
  });

  it('anuncia falha de logout sem remover a sessão conhecida', async () => {
    server.use(http.post(`${apiUrl}/auth/logout`, () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();

    renderApp('/organizer', { id: 'organizer-logout-error', role: UserRole.Organizer });
    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível encerrar a sessão. Tente novamente.',
    );
    expect(screen.getByRole('heading', { name: 'Meus eventos' })).toBeInTheDocument();
  });
});
