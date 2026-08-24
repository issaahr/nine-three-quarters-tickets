import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { buttonVariants } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cn } from '../../../lib/utils';
import { EventCategory, EventStatus } from '../../events/types';
import { formatEventPrice } from '../../events/eventPresentation';
import { OrganizerEventCard } from '../components/OrganizerEventCard';
import { useOrganizerEvents, usePublishEvent } from '../hooks';
import { OrganizerEvent } from '../types';

interface OrganizerNavigationState {
  eventPublished?: boolean;
}

function getEventVenueDate(event: OrganizerEvent): string {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: event.venueTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(event.startsAt));
  const parts = Object.fromEntries(
    dateParts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Exibe a gestão inicial das sessões pertencentes ao organizador autenticado.
 */
export function OrganizerHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationState = location.state as OrganizerNavigationState | null;
  const [eventPublished] = useState(() => navigationState?.eventPublished === true);
  const [titleQuery, setTitleQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'ALL'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const eventsQuery = useOrganizerEvents();
  const publishMutation = usePublishEvent();
  const organizerEvents = eventsQuery.data ?? [];
  const activeEvents = organizerEvents.filter((event) => event.isActive).length;
  const soldTickets = organizerEvents.reduce((total, event) => total + event.soldTickets, 0);
  const revenueCents = organizerEvents.reduce((total, event) => total + event.revenueCents, 0);
  const normalizedTitleQuery = titleQuery.trim().toLocaleLowerCase('pt-BR');
  const filteredEvents = organizerEvents.filter((event) => {
    const eventDate = getEventVenueDate(event);

    return (
      (!normalizedTitleQuery ||
        event.title.toLocaleLowerCase('pt-BR').includes(normalizedTitleQuery)) &&
      (categoryFilter === 'ALL' || event.category === categoryFilter) &&
      (statusFilter === 'ALL' || event.status === statusFilter) &&
      (!dateFrom || eventDate >= dateFrom) &&
      (!dateTo || eventDate <= dateTo)
    );
  });
  const hasActiveFilters = Boolean(
    titleQuery || categoryFilter !== 'ALL' || statusFilter !== 'ALL' || dateFrom || dateTo,
  );

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
          <h2 className="font-heading text-2xl font-semibold">Crie seu primeiro evento</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            Escolha um filme ou show, defina o local e o horário e publique seu primeiro evento.
          </p>
        </section>
      )}

      {eventsQuery.data && eventsQuery.data.length > 0 && (
        <>
          <section
            aria-label="Filtros de eventos"
            className="mb-6 grid gap-3 border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <div>
              <label
                htmlFor="organizer-title"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground"
              >
                Título
              </label>
              <Input
                id="organizer-title"
                type="search"
                aria-label="Pesquisar por título"
                value={titleQuery}
                onChange={(event) => setTitleQuery(event.target.value)}
                placeholder="Pesquisar por título"
                className="h-10 rounded-[4px] bg-white"
              />
            </div>
            <div>
              <label
                htmlFor="organizer-category"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground"
              >
                Categoria
              </label>
              <select
                id="organizer-category"
                aria-label="Filtrar por tipo"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as EventCategory | 'ALL')}
                className="h-10 w-full rounded-[4px] border border-input bg-white px-3 text-sm"
              >
                <option value="ALL">Todos os tipos</option>
                <option value={EventCategory.Movie}>Filmes</option>
                <option value={EventCategory.Show}>Shows</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="organizer-status"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground"
              >
                Status
              </label>
              <select
                id="organizer-status"
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as EventStatus | 'ALL')}
                className="h-10 w-full rounded-[4px] border border-input bg-white px-3 text-sm"
              >
                <option value="ALL">Todos os status</option>
                <option value={EventStatus.Draft}>Rascunhos</option>
                <option value={EventStatus.Published}>Publicados</option>
                <option value={EventStatus.Cancelled}>Cancelados</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="organizer-date-from"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground"
              >
                A partir de dd/mm/aaaa
              </label>
              <Input
                id="organizer-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-10 rounded-[4px] bg-white"
              />
            </div>
            <div>
              <label
                htmlFor="organizer-date-to"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground"
              >
                Até dd/mm/aaaa
              </label>
              <Input
                id="organizer-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-10 rounded-[4px] bg-white"
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setTitleQuery('');
                  setCategoryFilter('ALL');
                  setStatusFilter('ALL');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-left text-sm font-medium text-primary underline-offset-4 hover:underline sm:col-span-2 lg:col-span-5"
              >
                Limpar filtros
              </button>
            )}
          </section>

          {filteredEvents.length === 0 ? (
            <section
              aria-label="Nenhum evento encontrado"
              className="border border-dashed border-border bg-card px-6 py-12 text-center"
            >
              <h2 className="m-0 font-heading text-2xl font-semibold">Nenhum evento encontrado</h2>
              <p className="mb-0 mt-3 text-sm text-muted-foreground">
                Nenhum evento corresponde aos filtros selecionados.
              </p>
            </section>
          ) : (
            <section aria-label="Eventos do organizador" className="grid gap-3">
              {filteredEvents.map((event) => (
                <OrganizerEventCard
                  key={event.id}
                  event={event}
                  onPublish={(eventId) => void handlePublish(eventId)}
                  isPublishing={publishMutation.isPending && publishMutation.variables === event.id}
                />
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
