import { CalendarDays, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatEventDateTime, formatEventPrice } from '../eventPresentation';
import { EventCategory, EventDiscoveryItem } from '../types';

const categoryLabels: Record<EventCategory, string> = {
  [EventCategory.Movie]: 'Filme',
  [EventCategory.Show]: 'Show',
};

interface EventCardProps {
  event: EventDiscoveryItem;
}

/**
 * Apresenta uma única ocorrência pública com a silhueta editorial de um ingresso físico.
 */
export function EventCard({ event }: EventCardProps) {
  return (
    <Link
      to={`/events/${event.id}`}
      className="group block h-full bg-border-clip p-px text-inherit no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_12px),calc(100%_-_12px)_100%,0_100%)]"
      aria-label={`Ver detalhes de ${event.title}`}
    >
      <article className="h-full">
        <div className="flex h-full flex-col bg-white [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_12px),calc(100%_-_12px)_100%,0_100%)]">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt=""
              loading="lazy"
              className="aspect-[2/3] w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.01]"
            />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center bg-secondary-foreground font-heading text-5xl text-primary-foreground">
              9¾
            </div>
          )}

          <div className="flex flex-1 flex-col p-3 sm:p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <span className="inline-flex rounded-[2px] bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[1.3px] text-primary">
                {categoryLabels[event.category]}
              </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {formatEventPrice(event.priceCents)}
              </span>
            </div>

            <h2 className="m-0 min-h-14 line-clamp-2 font-heading text-xl font-semibold leading-tight text-foreground">
              {event.title}
            </h2>

            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="m-0 flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="font-mono">
                  {formatEventDateTime(event.startsAt, event.venueTimeZone)}
                </span>
              </p>
              <p className="m-0 flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  {event.venueName} · {event.venueCity}
                </span>
              </p>
            </div>

            {event.genres.length > 0 && (
              <p className="mb-0 mt-auto pt-4 text-[10px] uppercase tracking-[1.1px] text-primary">
                {event.genres.slice(0, 3).join(' · ')}
              </p>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
