import { EventSeatMapItem, EventSeatStatus } from '../types';

interface SeatMapProps {
  seats: EventSeatMapItem[];
  selectedSeatIds: string[];
  selectionDisabled: boolean;
  onToggleSeat: (seatId: string) => void;
}

/**
 * Renderiza exclusivamente as posições materializadas pela API, sem inferir fileiras no frontend.
 */
export function SeatMap({ seats, selectedSeatIds, selectionDisabled, onToggleSeat }: SeatMapProps) {
  const maximumX = Math.max(...seats.map(({ x }) => x));
  const maximumY = Math.max(...seats.map(({ y }) => y));
  const selectedSeatIdSet = new Set(selectedSeatIds);

  return (
    <section aria-labelledby="seat-map-title" className="mt-10 border-t border-[#E2D9CB] pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.3px] text-primary">
            Escolha seus lugares
          </p>
          <h2 id="seat-map-title" className="mb-0 mt-2 font-heading text-3xl font-semibold">
            Mapa de assentos
          </h2>
        </div>
        <div aria-label="Legenda do mapa" className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-sm border border-primary bg-white" />
            Disponível
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-sm bg-primary" />
            Selecionado
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-sm bg-muted-foreground" />
            Indisponível
          </span>
        </div>
      </div>

      <div
        aria-label="Mapa de assentos"
        className="mt-6 grid max-w-xl gap-2 rounded-[4px] bg-muted p-4"
        style={{
          gridTemplateColumns: `repeat(${maximumX + 1}, minmax(2.25rem, 1fr))`,
          gridTemplateRows: `repeat(${maximumY + 1}, minmax(2.25rem, 1fr))`,
        }}
      >
        {seats.map((seat) => {
          const selected = selectedSeatIdSet.has(seat.id);
          const available = seat.status === EventSeatStatus.Available;
          const disabled = selectionDisabled || !available;
          const accessibilityStatus = selected
            ? 'selecionado'
            : available
              ? 'disponível'
              : 'indisponível';

          return (
            <button
              key={seat.id}
              type="button"
              aria-label={`Assento ${seat.label}, ${accessibilityStatus}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onToggleSeat(seat.id)}
              style={{ gridColumn: seat.x + 1, gridRow: seat.y + 1 }}
              className={`min-h-9 rounded-[3px] border px-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : available
                    ? 'border-primary bg-white text-primary hover:bg-primary/10'
                    : 'border-muted-foreground bg-muted-foreground text-primary-foreground'
              }`}
            >
              {seat.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
