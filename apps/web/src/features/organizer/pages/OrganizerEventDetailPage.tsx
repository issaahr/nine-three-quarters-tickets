import { ArrowLeft, CalendarDays, MapPin, Pencil } from 'lucide-react';
import { useState } from 'react';
import { NumericFormat } from 'react-number-format';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatEventDateTime, formatEventPrice } from '../../events/eventPresentation';
import { useCancelOrganizerEvent, useOrganizerEvents, useUpdateEventPrice } from '../hooks';
import { EventStatus } from '../types';

const maximumPriceCents = 100_000_000;

/** Exibe a ocorrência para gestão, sem expor o mapa de assentos do cliente. */
export function OrganizerEventDetailPage() {
  const { eventId } = useParams();
  const eventsQuery = useOrganizerEvents();
  const updatePriceMutation = useUpdateEventPrice();
  const cancelMutation = useCancelOrganizerEvent();
  const event = eventsQuery.data?.find((item) => item.id === eventId);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceCents, setPriceCents] = useState<number | undefined>();
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (eventsQuery.isLoading)
    return <main className="mx-auto max-w-5xl px-4 py-12">Carregando evento...</main>;
  if (!event) return <main className="mx-auto max-w-5xl px-4 py-12">Evento não encontrado.</main>;

  const canEdit = event.status !== EventStatus.Cancelled;
  const startEditing = (): void => {
    setPriceCents(event.priceCents);
    setEditingPrice(true);
  };
  const savePrice = (): void => {
    if (priceCents !== undefined && priceCents <= maximumPriceCents) {
      void updatePriceMutation
        .mutateAsync({ eventId: event.id, priceCents })
        .then(() => setEditingPrice(false));
    }
  };

  return (
    <main className="mx-auto min-h-[calc(100vh-68px)] w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Link
        to="/organizer"
        className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-primary no-underline hover:underline"
      >
        <ArrowLeft className="size-4" />
        Voltar aos eventos
      </Link>
      <section className="grid gap-8 border border-border-panel bg-white p-5 sm:grid-cols-[180px_1fr] sm:p-8">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" className="w-full max-w-[180px] object-cover" />
        ) : (
          <div className="flex aspect-[2/3] max-w-[180px] items-center justify-center bg-muted font-heading text-4xl">
            9¾
          </div>
        )}
        <div>
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">
            Detalhes do evento
          </p>
          <h1 className="mb-5 mt-2 font-heading text-4xl font-semibold">{event.title}</h1>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4 text-primary" />
            {formatEventDateTime(event.startsAt, event.venueTimeZone)}
          </p>
          <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4 text-primary" />
            {event.venueName} · {event.venueCity}
          </p>
          <div className="mt-8">
            <p className="m-0 text-[10px] uppercase tracking-[1px] text-muted-foreground">
              Preço do ingresso
            </p>
            <div className="mt-1 flex items-center gap-3">
              {editingPrice ? (
                <NumericFormat
                  aria-label="Preço do ingresso"
                  customInput={Input}
                  value={priceCents === undefined ? '' : priceCents / 100}
                  onValueChange={({ floatValue }) =>
                    setPriceCents(
                      floatValue === undefined ? undefined : Math.round(floatValue * 100),
                    )
                  }
                  prefix="R$ "
                  decimalSeparator=","
                  allowedDecimalSeparators={[',', '.']}
                  thousandSeparator="."
                  decimalScale={2}
                  fixedDecimalScale
                  allowNegative={false}
                  inputMode="decimal"
                  className="h-9 w-40 rounded-[4px] border-border-input font-mono"
                />
              ) : (
                <p className="m-0 font-mono text-xl font-semibold">
                  {formatEventPrice(event.priceCents)}
                </p>
              )}
              {canEdit && !editingPrice && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Editar preço"
                  onClick={startEditing}
                  className="self-center"
                >
                  <Pencil />
                </Button>
              )}
              {editingPrice && (
                <Button
                  type="button"
                  disabled={
                    updatePriceMutation.isPending ||
                    priceCents === undefined ||
                    priceCents > maximumPriceCents
                  }
                  onClick={savePrice}
                  className="rounded-[4px]"
                >
                  Salvar preço
                </Button>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="mt-9 flex justify-end">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmCancel(true)}
                className="rounded-[4px]"
              >
                Cancelar evento
              </Button>
            </div>
          )}
        </div>
      </section>
      {confirmCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <section className="w-full max-w-md bg-white p-6 shadow-xl sm:p-8">
            <h2 className="m-0 font-heading text-3xl font-semibold">Cancelar evento?</h2>
            <p className="mb-0 mt-4 text-sm leading-6 text-muted-foreground">
              As compras confirmadas serão canceladas e reembolsadas integralmente.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={cancelMutation.isPending}
                onClick={() => setConfirmCancel(false)}
                className="rounded-[4px]"
              >
                Manter evento
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cancelMutation.isPending}
                onClick={() =>
                  void cancelMutation.mutateAsync(event.id).then(() => setConfirmCancel(false))
                }
                className="rounded-[4px]"
              >
                {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
