import { CheckInResult } from '../types';

interface CheckInResultPanelProps {
  result: CheckInResult;
  onReset: () => void;
}

const resultPresentation: Record<
  CheckInResult,
  { title: string; description: string; className: string }
> = {
  [CheckInResult.Valid]: {
    title: 'Entrada liberada',
    description: 'Check-in registrado com sucesso.',
    className: 'border-[#5A8F68] bg-[#173B27] text-[#D9F0DE]',
  },
  [CheckInResult.Invalid]: {
    title: 'Credencial inválida',
    description: 'Não foi possível validar este ingresso.',
    className: 'border-[#8B3A3A] bg-[#3A1217] text-[#F5D6D6]',
  },
  [CheckInResult.AlreadyUsed]: {
    title: 'Ingresso já utilizado',
    description: 'Este Ticket já possui um check-in registrado.',
    className: 'border-[#8A6D3B] bg-[#3B2D14] text-[#F5E6BE]',
  },
  [CheckInResult.EventMismatch]: {
    title: 'Evento diferente',
    description: 'Este Ticket pertence a outra ocorrência.',
    className: 'border-[#8A6D3B] bg-[#3B2D14] text-[#F5E6BE]',
  },
  [CheckInResult.Cancelled]: {
    title: 'Ingresso cancelado',
    description: 'Este Ticket não permite entrada.',
    className: 'border-[#8B3A3A] bg-[#3A1217] text-[#F5D6D6]',
  },
};

export function CheckInResultPanel({ result, onReset }: CheckInResultPanelProps) {
  const presentation = resultPresentation[result];

  return (
    <section
      role="status"
      className={`rounded-[4px] border p-6 text-center ${presentation.className}`}
      aria-live="assertive"
    >
      {result === CheckInResult.Valid && (
        <p className="mx-auto w-fit -rotate-2 border-2 border-current px-3 py-1 font-mono text-xs font-bold tracking-[0.16em] uppercase">
          Entrada liberada
        </p>
      )}
      <h2 className="mt-4 font-heading text-3xl font-semibold">{presentation.title}</h2>
      <p className="mt-2 text-sm">{presentation.description}</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 rounded-[4px] border border-current px-4 py-2 text-sm font-medium transition-colors hover:bg-black/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        Nova validação
      </button>
    </section>
  );
}
