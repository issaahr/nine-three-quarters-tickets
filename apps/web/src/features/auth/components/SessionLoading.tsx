import { useEffect, useState } from 'react';

const loadingMessageDelayMilliseconds = 200;

/** Exibe um shell neutro e evita piscar a mensagem em consultas de sessão rápidas. */
export function SessionLoading() {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowMessage(true), loadingMessageDelayMilliseconds);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center" aria-live="polite">
        <p className="font-heading text-3xl font-semibold text-primary">9¾ Tickets</p>
        {showMessage && <p className="mt-3 text-sm text-muted-foreground">Carregando sessão...</p>}
      </div>
    </main>
  );
}
