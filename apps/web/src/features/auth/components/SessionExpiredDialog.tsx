import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/button';

/** Exige novo login quando uma ação autenticada recebe 401 da API. */
export function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const show = (): void => setOpen(true);
    window.addEventListener('session-expired', show);
    return () => window.removeEventListener('session-expired', show);
  }, []);

  if (!open) return null;

  function handleLogin(): void {
    setOpen(false);
    queryClient.setQueryData(['auth', 'session'], null);
    navigate('/login');
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
    >
      <section className="w-full max-w-md bg-white p-6 text-center shadow-xl sm:p-8">
        <h2 id="session-expired-title" className="m-0 font-heading text-3xl font-semibold">
          Sessão expirada
        </h2>
        <p className="mb-0 mt-4 text-sm leading-6 text-muted-foreground">
          Sua sessão expirou. Faça login novamente para continuar.
        </p>
        <div className="mt-6 flex justify-center">
          <Button type="button" onClick={handleLogin} className="rounded-[4px]">
            Fazer login
          </Button>
        </div>
      </section>
    </div>
  );
}
