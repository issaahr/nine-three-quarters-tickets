import { useAuth } from '../features/auth/hooks';

export function Home() {
  const { user, logout, isLoggingOut, logoutError } = useAuth();

  /** Solicita o encerramento da sessão sem produzir uma rejeição não tratada no navegador. */
  async function handleLogout(): Promise<void> {
    try {
      await logout();
    } catch {
      // O erro permanece disponível no estado da mutation para apresentação ao usuário.
    }
  }

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="font-heading text-3xl font-semibold">9¾ Tickets</h1>
      <p className="mt-6">Sessão autenticada.</p>
      <dl className="mt-4 space-y-2">
        <div>
          <dt className="font-semibold">Identificador</dt>
          <dd>{user?.id}</dd>
        </div>
        <div>
          <dt className="font-semibold">Perfil</dt>
          <dd>{user?.role}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="mt-6 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={isLoggingOut}
        onClick={() => void handleLogout()}
      >
        {isLoggingOut ? 'Saindo...' : 'Sair'}
      </button>
      {logoutError && <p className="mt-3 text-destructive">Não foi possível encerrar a sessão.</p>}
    </main>
  );
}
