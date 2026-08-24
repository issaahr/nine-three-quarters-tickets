import { CalendarDays, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatEventDateTime, formatEventPrice } from '../../events/eventPresentation';
import { EventStatus, OrganizerEvent } from '../types';

const statusLabels: Record<EventStatus, string> = {
  [EventStatus.Draft]: 'Rascunho',
  [EventStatus.Published]: 'Publicado',
  [EventStatus.Cancelled]: 'Cancelado',
};
const statusClassNames: Record<EventStatus, string> = {
  [EventStatus.Draft]: 'bg-muted text-muted-foreground',
  [EventStatus.Published]: 'bg-status-valid-background text-status-valid',
  [EventStatus.Cancelled]: 'bg-destructive/10 text-destructive',
};
interface OrganizerEventCardProps {
  event: OrganizerEvent;
  onPublish: (eventId: string) => void;
  isPublishing: boolean;
}

/** Apresenta o resumo navegável de uma ocorrência do organizador. */
export function OrganizerEventCard({ event, onPublish, isPublishing }: OrganizerEventCardProps) {
  const isDraft = event.status === EventStatus.Draft;
  const showSales = event.status !== EventStatus.Cancelled;
  return (
    <article className="relative border border-border-panel bg-white p-4 [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_10px),calc(100%_-_10px)_100%,0_100%)]">
      <Link
        to={`/organizer/events/${event.id}`}
        className="grid grid-cols-[64px_minmax(0,1fr)] gap-4 text-inherit no-underline sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center"
      >
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt=""
            className="h-24 w-16 object-cover sm:h-[108px] sm:w-[72px]"
          />
        ) : (
          <div className="flex h-24 w-16 items-center justify-center bg-muted font-heading text-2xl text-muted-foreground sm:h-[108px] sm:w-[72px]">
            9¾
          </div>
        )}
        <div className="min-w-0">
          <h2 className="mb-2 mt-0 break-words font-heading text-xl font-semibold">
            {event.title}
          </h2>
          <p className="mb-1 flex items-center gap-2 text-[13px] text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" />
            {formatEventDateTime(event.startsAt, event.venueTimeZone)}
          </p>
          <p className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            {event.venueName} · {event.venueCity}
          </p>
        </div>
        <div className="col-span-2 flex items-center justify-end gap-5 border-t border-border-subtle pt-3 sm:col-span-1 sm:border-0 sm:pt-0">
          {showSales && (
            <div className="text-right">
              <p className="m-0 font-mono text-sm font-medium">
                {event.availableTickets === null
                  ? '—'
                  : `${event.availableTickets}/${event.inventoryTotal}`}
              </p>
              <p className="m-0 text-[10px] text-muted-foreground">disponíveis</p>
            </div>
          )}
          <div className="text-right">
            <p className="m-0 font-mono text-sm font-medium">
              {formatEventPrice(event.priceCents)}
            </p>
            <p className="m-0 text-[10px] text-muted-foreground">Preço unitário</p>
          </div>
        </div>
      </Link>
      <span
        className={cn(
          'absolute right-4 top-4 inline-flex rounded-[2px] px-2 py-1 text-[10px] font-semibold uppercase tracking-[1px]',
          statusClassNames[event.status],
        )}
      >
        {statusLabels[event.status]}
      </span>
      {isDraft && (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isPublishing}
            onClick={() => onPublish(event.id)}
            className="h-8 rounded-[4px]"
          >
            {isPublishing ? 'Publicando...' : 'Publicar'}
          </Button>
        </div>
      )}
    </article>
  );
}
