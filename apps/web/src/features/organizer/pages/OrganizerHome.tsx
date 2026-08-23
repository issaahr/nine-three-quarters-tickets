import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { formatEventPrice } from '../../events/eventPresentation';
import { OrganizerEventCard } from '../components/OrganizerEventCard';
import { useOrganizerEvents, usePublishEvent } from '../hooks';

interface OrganizerNavigationState {
  eventPublished?: boolean;
}

/**
 * Exibe a gestão inicial das sessões pertencentes ao organizador autenticado.
 */
export function OrganizerHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationState = location.state as OrganizerNavigationState | null;
  const [eventPublished] = useState(() => navigationState?.eventPublished === true);
  const eventsQuery = useOrganizerEvents();
  const publishMutation = usePublishEvent();
  const organizerEvents = eventsQuery.data ?? [];
  const activeEvents = organizerEvents.filter((event) => event.isActive).length;
  const soldTickets = organizerEvents.reduce((total, event) => total + event.soldTickets, 0);
  const revenueCents = organizerEvents.reduce((total, event) => total + event.revenueCents, 0);

  // Remove o flash do histórico sem ocultá-lo durante a navegação que o originou.
  useEffect(() => {
    if (navigationState?.eventPublished) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationState?.eventPublished]);

  /**
   * Solicita a publicação e mantém a falha disponível para anúncio no painel.
   */
  async function handlePublish(eventId: string): Promise<void> {
    try {
      await publishMutation.mutateAsync(eventId);
    } catch {
      // A mensagem é renderizada a partir do estado da mutation.
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-68px)] w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[2px] text-primary">
            Área do organizador
          </p>
          <h1 className="m-0 font-heading text-4xl font-semibold text-foreground sm:text-5xl">
            Meus eventos
          </h1>
        </div>
        <Link
          to="/organizer/events/new"
          className={cn(buttonVariants({ size: 'lg' }), 'h-10 rounded-[4px] px-4')}
        >
          <Plus aria-hidden="true" />
          Criar evento
        </Link>
      </header>

      {eventPublished && (
        <p role="status" className="mb-6 border-l-2 border-status-valid py-2 pl-4 text-sm">
          Evento criado e publicado com sucesso.
        </p>
      )}

      {publishMutation.isError && (
        <p role="alert" className="mb-6 text-sm text-destructive">
          Não foi possível publicar o evento. Tente novamente.
        </p>
      )}

      {eventsQuery.data && organizerEvents.length > 0 && (
        <section className="mb-8 grid gap-3 sm:grid-cols-3" aria-label="Resumo dos eventos">
          {[
            ['Eventos ativos', String(activeEvents)],
            ['Ingressos vendidos', String(soldTickets)],
            ['Receita total', formatEventPrice(revenueCents)],
          ].map(([label, value]) => (
            <article
              key={label}
              className="bg-secondary-foreground p-4 text-primary-foreground [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_10px),calc(100%_-_10px)_100%,0_100%)]"
            >
              <p className="m-0 text-[10px] font-medium uppercase tracking-[1.2px] text-brass-dark">
                {label}
              </p>
              <p className="mb-0 mt-2 font-mono text-2xl font-semibold">{value}</p>
            </article>
          ))}
        </section>
      )}

      {eventsQuery.isLoading && <p role="status">Carregando seus eventos...</p>}

      {eventsQuery.isError && (
        <div role="alert" className="border-l-2 border-destructive py-2 pl-4 text-destructive">
          Não foi possível carregar seus eventos. Tente novamente em instantes.
        </div>
      )}

      {eventsQuery.data?.length === 0 && (
        <section className="border border-border bg-card px-6 py-12 text-center [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_12px),calc(100%_-_12px)_100%,0_100%)]">
          <h2 className="font-heading text-2xl font-semibold">Sua programação começa aqui</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            Escolha um filme ou show, defina o local e o horário e publique seu primeiro evento.
          </p>
        </section>
      )}

      {eventsQuery.data && eventsQuery.data.length > 0 && (
        <section aria-label="Eventos do organizador" className="grid gap-3">
          {eventsQuery.data.map((event) => (
            <OrganizerEventCard
              key={event.id}
              event={event}
              onPublish={(eventId) => void handlePublish(eventId)}
              isPublishing={publishMutation.isPending && publishMutation.variables === event.id}
            />
          ))}
        </section>
      )}
    </main>
  );
}
