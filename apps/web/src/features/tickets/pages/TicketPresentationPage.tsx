import axios from 'axios';
import { CalendarDays, MapPin, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '../../../components/ui/button';
import { formatEventDetailDateTime } from '../../events/eventPresentation';
import { useSharedTicket } from '../hooks';
import { getTicketLocationLabel, getTicketStatusLabel } from '../ticketPresentation';
import { TicketStatus } from '../types';

interface TicketPresentationPageProps {
  shared?: boolean;
}

const ticketStatusClassName: Record<TicketStatus, string> = {
  [TicketStatus.Valid]: 'bg-[#3E6B4F] text-[#D9F0DE]',
  [TicketStatus.Used]: 'bg-[#6B5636] text-[#F5F2EC]',
  [TicketStatus.Cancelled]: 'bg-[#8B3A3A] text-[#F5F2EC]',
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
  const returnPath = shared ? '/events' : '/customer/tickets';

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
      <Link
        to={returnPath}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {shared ? 'Ver eventos' : 'Voltar aos meus ingressos'}
      </Link>

      <div className="mt-6 flex w-full justify-center">
        <article className="w-full max-w-xl overflow-hidden bg-[#2B0A10] text-[#F5F2EC] [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_22px),calc(100%_-_22px)_100%,0_100%)]">
          <header className="flex flex-col gap-5 px-5 pb-6 pt-6 sm:flex-row sm:items-start sm:justify-between sm:px-8 sm:pt-8">
            <div>
              <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C9A768]">
                {ticket.event.category === 'MOVIE' ? 'Filme' : 'Show'}
              </p>
              <h1 className="mb-0 mt-2 font-heading text-3xl font-semibold">
                {ticket.event.title}
              </h1>
              <p className="mb-0 mt-3 text-sm text-[#C9BBA6]">
                {ticket.event.venueName} · {ticket.event.venueCity}
              </p>
            </div>
            <span
              className={`w-fit rounded-[3px] px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${ticketStatusClassName[ticket.status]}`}
            >
              {getTicketStatusLabel(ticket.status)}
            </span>
          </header>

          <div className="grid gap-3 px-5 pb-6 sm:grid-cols-2 sm:px-8">
            <p className="m-0 flex items-start gap-2 text-sm text-[#D9C7A0]">
              <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {formatEventDetailDateTime(ticket.event.startsAt, ticket.event.venueTimeZone)}
            </p>
            <p className="m-0 flex items-start gap-2 text-sm text-[#D9C7A0]">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {getTicketLocationLabel(ticket.seatLabel)}
            </p>
          </div>

          <div className="flex items-center gap-2 px-3" aria-hidden="true">
            <span className="size-4 -translate-x-5 rounded-full bg-background" />
            <span className="h-px flex-1 border-t border-dashed border-[#6B5636]" />
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
            <p className="mb-0 mt-6 font-mono text-lg font-medium tracking-[0.16em] text-[#D9C7A0]">
              {ticket.manualCode}
            </p>
            <p className="mb-0 mt-2 text-xs text-[#A9855B]">Apresente este código na entrada</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleShare()}
              className="mt-6 rounded-[4px] border-[#6B5636] bg-transparent text-[#D9C7A0] hover:bg-[#3A1A20] hover:text-[#F5F2EC]"
            >
              <Share2 aria-hidden="true" />
              Compartilhar
            </Button>
            {shareMessage && (
              <p role="status" className="mb-0 mt-3 text-xs text-[#D9C7A0]">
                {shareMessage}
              </p>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
