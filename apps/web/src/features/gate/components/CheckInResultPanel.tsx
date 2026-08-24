import { Check, Clock3, MapPinOff, X } from 'lucide-react';

import { CheckInResult } from '../types';

interface CheckInResultPanelProps {
  result: CheckInResult;
  onReset: () => void;
}

const resultPresentation: Record<
  CheckInResult,
  { title: string; description: string; icon: typeof Check; iconClassName: string }
> = {
  [CheckInResult.Valid]: {
    title: 'Entrada liberada',
    description: 'Check-in registrado com sucesso.',
    icon: Check,
    iconClassName: 'border-status-valid text-status-valid-soft',
  },
  [CheckInResult.Invalid]: {
    title: 'Credencial inválida',
    description: 'Não foi possível validar este ingresso.',
    icon: X,
    iconClassName: 'border-destructive text-destructive-soft',
  },
  [CheckInResult.AlreadyUsed]: {
    title: 'Ingresso já utilizado',
    description: 'Este ingresso já foi utilizado',
    icon: Clock3,
    iconClassName: 'border-brass-dark text-primary-foreground',
  },
  [CheckInResult.EventMismatch]: {
    title: 'Evento diferente',
    description: 'Ingresso não pertence a este evento',
    icon: MapPinOff,
    iconClassName: 'border-neutral-dark-border text-surface-dark-muted',
  },
  [CheckInResult.Cancelled]: {
    title: 'Ingresso cancelado',
    description: 'Este Ticket não permite entrada.',
    icon: X,
    iconClassName: 'border-destructive text-destructive-soft',
  },
};

/** Apresenta o resultado semântico da validação no padrão visual operacional da portaria. */
export function CheckInResultPanel({ result, onReset }: CheckInResultPanelProps) {
  const presentation = resultPresentation[result];
  const Icon = presentation.icon;

  return (
    <section
      role="status"
      className="rounded-[8px] bg-surface-dark p-6 text-center text-background"
      aria-live="assertive"
    >
      <span
        className={`mx-auto flex size-[52px] items-center justify-center rounded-full border-2 ${presentation.iconClassName}`}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-3 font-heading text-xl font-semibold">{presentation.title}</h2>
      <p className="mt-1 text-sm text-border">{presentation.description}</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 rounded-[4px] border border-brass-border px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-surface-dark-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        Nova validação
      </button>
    </section>
  );
}
