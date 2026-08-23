import { Minus, Plus, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { formatEventPrice } from '../eventPresentation';

interface GeneralAdmissionReservationPanelProps {
  availableQuantity: number;
  canReserve: boolean;
  feedback: string | null;
  hasActiveReservation: boolean;
  isCreating: boolean;
  isCustomer: boolean;
  quantity: number;
  unitPriceCents: number;
  onChangeQuantity: (quantity: number) => void;
  onOpenActiveReservation: () => void;
  onReserve: () => void;
}

export function GeneralAdmissionReservationPanel({
  availableQuantity,
  canReserve,
  feedback,
  hasActiveReservation,
  isCreating,
  isCustomer,
  quantity,
  unitPriceCents,
  onChangeQuantity,
  onOpenActiveReservation,
  onReserve,
}: GeneralAdmissionReservationPanelProps) {
  const isSoldOut = availableQuantity === 0;
  const purchaseEnabled = canReserve && !isSoldOut;

  return (
    <section className="mx-auto mt-8 max-w-4xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.4px] text-primary">
            Entrada
          </p>
          <h2 className="mb-0 mt-2 flex items-center gap-2 font-heading text-3xl font-semibold">
            <Ticket className="size-5 text-primary" aria-hidden="true" />
            Pista
          </h2>
          <p className="mb-0 mt-2 text-sm text-muted-foreground">Entrada geral</p>
        </div>

        {purchaseEnabled && (
          <div className="flex items-end gap-4 border border-border bg-background p-3 shadow-sm">
            <div>
              <p className="mb-2 mt-0 text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground">
                Quantidade
              </p>
              <div
                className="flex items-center border border-border"
                aria-label="Quantidade de ingressos"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={quantity <= 1}
                  onClick={() => onChangeQuantity(quantity - 1)}
                  aria-label="Diminuir quantidade"
                  className="rounded-none"
                >
                  <Minus className="size-4" aria-hidden="true" />
                </Button>
                <output aria-live="polite" className="min-w-12 text-center font-mono font-semibold">
                  {quantity}
                </output>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={quantity >= availableQuantity}
                  onClick={() => onChangeQuantity(quantity + 1)}
                  aria-label="Aumentar quantidade"
                  className="rounded-none"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="border-l border-border pl-4">
              <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground">
                Preço unitário
              </p>
              <p className="mb-0 mt-2 font-mono text-lg font-semibold">
                {formatEventPrice(unitPriceCents)}
              </p>
            </div>
          </div>
        )}
      </div>

      {feedback && (
        <p role="status" className="mb-0 mt-5 text-sm text-primary">
          {feedback}
        </p>
      )}

      {canReserve && isCustomer && hasActiveReservation && (
        <div className="mt-5 rounded-[4px] border border-primary/20 bg-primary/5 p-4">
          <p className="m-0 text-sm font-medium">Você já tem uma reserva em andamento.</p>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenActiveReservation}
            className="mt-3 rounded-[4px]"
          >
            Ver reserva em andamento
          </Button>
        </div>
      )}

      {canReserve && isSoldOut && (
        <div role="status" className="mt-6 border-l-4 border-destructive bg-destructive/10 p-4">
          <p className="m-0 text-sm font-medium text-destructive">Ingressos esgotados.</p>
        </div>
      )}

      {purchaseEnabled && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-secondary-foreground p-4 text-primary-foreground sm:p-5">
          <div>
            <p className="m-0 text-sm font-medium">
              {quantity} ingresso{quantity === 1 ? '' : 's'} · Pista
            </p>
            <p className="mb-0 mt-1 font-mono text-sm">
              {formatEventPrice(quantity * unitPriceCents)}
            </p>
          </div>
          {isCustomer ? (
            <Button
              type="button"
              disabled={isCreating || hasActiveReservation}
              onClick={onReserve}
              className="rounded-[4px]"
            >
              {isCreating ? 'Reservando...' : 'Reservar ingressos'}
            </Button>
          ) : (
            <Link to="/login" className={cn(buttonVariants(), 'rounded-[4px] no-underline')}>
              Entre como cliente para reservar
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
