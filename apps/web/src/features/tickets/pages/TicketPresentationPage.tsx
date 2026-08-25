import axios from 'axios';
import { ArrowLeft, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { formatTicketEventDateTime } from '../../events/eventPresentation';
import { useSharedTicket } from '../hooks';
import { getTicketStatusLabel } from '../ticketPresentation';
import { TicketStatus } from '../types';

interface TicketPresentationPageProps {
  shared?: boolean;
}

const ticketStatusTextClassName: Record<TicketStatus, string> = {
  [TicketStatus.Valid]: 'text-status-valid',
  [TicketStatus.Used]: 'text-primary-foreground',
  [TicketStatus.Cancelled]: 'text-destructive',
};

export function TicketPresentationPage({ shared = false }: TicketPresentationPageProps) {
  const { credential } = useParams<{ credential: string }>();
  const ticketQuery = useSharedTicket(credential);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  if (ticketQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-6">
        <p role="status" className="text-sm text-muted-foreground">
          Carregando ingresso...
        </p>
      </main>
    );
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    const notFound =
      axios.isAxiosError(ticketQuery.error) && ticketQuery.error.response?.status === 404;

    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="m-0 font-heading text-4xl font-semibold">
          {notFound ? 'Ingresso não encontrado' : 'Não foi possível carregar o ingresso'}
        </h1>
        <p className="mb-0 mt-4 text-sm leading-7 text-muted-foreground">
          {notFound
            ? 'Verifique o link recebido e tente novamente.'
            : 'Tente novamente em instantes.'}
        </p>
      </main>
    );
  }

  const ticket = ticketQuery.data;
  async function handleShare(): Promise<void> {
    const shareUrl = new URL(
      `/tickets/shared/${encodeURIComponent(ticket.credential)}`,
      window.location.origin,
    ).toString();

    try {
      if (navigator.share) {
        await navigator.share({ title: ticket.event.title, url: shareUrl });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setShareMessage('Link copiado para compartilhar este ingresso.');
    } catch {
      setShareMessage('Não foi possível compartilhar o link agora.');
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-12">
      {shared ? (
        <p className="mb-0 text-center text-sm font-medium text-muted-foreground">
          O seguinte ingresso foi compartilhado com você
        </p>
      ) : (
        <Link
          to="/customer/tickets"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar aos meus ingressos
        </Link>
      )}

      <div className="mt-6 flex w-full justify-center">
        <article className="w-full max-w-[410px] overflow-hidden bg-secondary-foreground text-background [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_22px),calc(100%_-_22px)_100%,0_100%)]">
          <header className="relative flex flex-col gap-5 px-5 pb-6 pt-6 sm:flex-row sm:items-start sm:justify-between sm:px-8 sm:pt-8">
            <div className="min-w-0 pr-12 sm:pr-0">
              <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-secondary">
                {ticket.event.category === 'MOVIE' ? 'Filme' : 'Show'}
              </p>
              <h1 className="mb-0 mt-2 font-heading text-3xl font-semibold">
                {ticket.event.title}
              </h1>
              <p className="mb-0 mt-3 font-mono text-xs text-primary-foreground">
                {formatTicketEventDateTime(ticket.event.startsAt, ticket.event.venueTimeZone)}
              </p>
            </div>
            <span className="absolute right-5 top-6 font-heading text-2xl font-semibold text-primary-foreground sm:static">
              9¾
            </span>
          </header>

          <div className="px-5 pb-6 sm:px-8">
            <p className="m-0 text-sm text-primary-foreground">
              {ticket.event.venueName} · {ticket.event.venueCity}
            </p>
            <div className="mt-5 flex gap-8">
              <div>
                <p className="m-0 text-[9px] font-medium uppercase tracking-[0.14em] text-brass-dark">
                  Assento
                </p>
                <p className="mb-0 mt-1 font-mono text-sm text-background">
                  {ticket.seatLabel ?? 'Entrada geral'}
                </p>
              </div>
              <div>
                <p className="m-0 text-[9px] font-medium uppercase tracking-[0.14em] text-brass-dark">
                  Status
                </p>
                <span
                  className={`mt-1 inline-block font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${ticketStatusTextClassName[ticket.status]}`}
                >
                  {getTicketStatusLabel(ticket.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3" aria-hidden="true">
            <span className="size-4 -translate-x-5 rounded-full bg-background" />
            <span className="h-px flex-1 border-t border-dashed border-brass-dark/50" />
            <span className="size-4 translate-x-5 rounded-full bg-background" />
          </div>

          <div className="flex flex-col items-center px-5 pb-8 pt-7 text-center sm:px-8">
            <QRCodeSVG
              value={ticket.credential}
              size={192}
              level="M"
              includeMargin
              bgColor="#F5F2EC"
              fgColor="#2B0A10"
              aria-label="Código QR do ingresso"
              className="max-w-full rounded-[4px]"
            />
            <p className="mb-0 mt-6 font-mono text-lg font-medium tracking-[0.16em] text-primary-foreground">
              {ticket.manualCode}
            </p>
            <p className="mb-0 mt-2 text-xs text-brass-dark">Apresente este código na entrada</p>
            {!shared && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleShare()}
                  className="mt-6 rounded-[4px] border-brass-dark/50 bg-transparent text-primary-foreground hover:bg-primary/20 hover:text-background"
                >
                  <Share2 aria-hidden="true" />
                  Compartilhar
                </Button>
                {shareMessage && (
                  <p role="status" className="mb-0 mt-3 text-xs text-primary-foreground">
                    {shareMessage}
                  </p>
                )}
              </>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
