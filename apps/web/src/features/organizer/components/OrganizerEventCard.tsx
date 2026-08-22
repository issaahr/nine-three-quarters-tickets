import { CalendarDays, MapPin } from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { formatEventDateTime, formatEventPrice } from '../../events/eventPresentation';
import { EventStatus, OrganizerEvent } from '../types';

const statusLabels: Record<EventStatus, string> = {
  [EventStatus.Draft]: 'Rascunho',
  [EventStatus.Published]: 'Publicado',
  [EventStatus.Cancelled]: 'Cancelado',
};

const statusClassNames: Record<EventStatus, string> = {
  [EventStatus.Draft]: 'bg-muted text-muted-foreground',
  [EventStatus.Published]: 'bg-[#E8F0EA] text-[#3E6B4F]',
  [EventStatus.Cancelled]: 'bg-destructive/10 text-destructive',
};

interface OrganizerEventCardProps {
  event: OrganizerEvent;
  onPublish: (eventId: string) => void;
  isPublishing: boolean;
}

/**
 * Apresenta uma ocorrência com horário canônico e ações permitidas pelo estado atual.
 */
export function OrganizerEventCard({ event, onPublish, isPublishing }: OrganizerEventCardProps) {
  const isDraft = event.status === EventStatus.Draft;

  return (
    <article className="relative grid grid-cols-[64px_minmax(0,1fr)] gap-4 border border-[#DED6C7] bg-white p-4 [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_10px),calc(100%_-_10px)_100%,0_100%)] sm:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[72px_minmax(0,1fr)_auto] lg:items-center">
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
        <h2 className="mb-2 mt-0 break-words font-heading text-xl font-semibold text-foreground">
          {event.title}
        </h2>
        <p className="mb-1 flex items-center gap-2 text-[13px] text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          {formatEventDateTime(event.startsAt, event.venueTimeZone)}
        </p>
        <p className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          {event.venueName} · {event.venueCity}
        </p>
        <div className="mt-5 text-right lg:hidden">
          <p className="m-0 font-mono text-sm font-medium text-foreground">
            {event.inventoryTotal == null
              ? '—'
              : `${event.soldTickets ?? 0}/${event.inventoryTotal}`}
          </p>
          <p className="m-0 text-[10px] text-muted-foreground">vendidos</p>
        </div>
      </div>

      <span
        className={cn(
          'absolute right-4 top-4 inline-flex w-fit rounded-[2px] px-2 py-1 text-[10px] font-semibold uppercase tracking-[1px] lg:right-5 lg:top-5',
          statusClassNames[event.status],
        )}
      >
        {statusLabels[event.status]}
      </span>

      <div className="col-span-2 flex items-end justify-between gap-3 border-t border-[#E8E1D5] pt-3 sm:col-start-2 sm:col-end-3 lg:col-start-3 lg:row-start-1 lg:self-end lg:border-0 lg:pt-0">
        <div className="hidden text-right lg:block">
          <p className="m-0 font-mono text-sm font-medium text-foreground">
            {event.inventoryTotal == null
              ? '—'
              : `${event.soldTickets ?? 0}/${event.inventoryTotal}`}
          </p>
          <p className="m-0 text-[10px] text-muted-foreground">vendidos</p>
        </div>
        <div className="ml-auto text-right lg:ml-0">
          <p className="m-0 font-mono text-sm font-medium text-foreground">
            {formatEventPrice(event.priceCents)}
          </p>
          <p className="m-0 text-[10px] text-muted-foreground">Preço unitário</p>
        </div>
        {isDraft && (
          <Button
            type="button"
            variant="outline"
            disabled={isPublishing}
            onClick={() => onPublish(event.id)}
            className="h-8 rounded-[4px]"
          >
            {isPublishing ? 'Publicando...' : 'Publicar'}
          </Button>
        )}
      </div>
    </article>
  );
}
