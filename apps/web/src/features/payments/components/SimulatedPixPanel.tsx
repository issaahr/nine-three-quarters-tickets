import { LoaderCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { useSimulatedPixPayment } from '../hooks';
import { PaymentStatus } from '../types';
import { CheckoutActions } from './CheckoutActions';

interface SimulatedPixPanelProps {
  paymentFlow: ReturnType<typeof useSimulatedPixPayment>;
  cancelAction: ReactNode;
  disabled: boolean;
}

export function SimulatedPixPanel({ paymentFlow, cancelAction, disabled }: SimulatedPixPanelProps) {
  const {
    create,
    payment,
    creationError,
    queryError,
    isChecking,
    isRefreshing,
    isCreating,
    refresh,
  } = paymentFlow;
  const isPending = payment?.status === PaymentStatus.Pending;
  const isApproved = payment?.status === PaymentStatus.Approved;
  const showGenerateAction = !isPending && !isApproved;

  const handleCreate = async (): Promise<void> => {
    try {
      await create();
    } catch {
      // A mutation mantém o erro visível e preserva a chave para repetir a tentativa.
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <p className="m-0 text-sm leading-6 text-muted-foreground">
        PIX de demonstração. O QR é simulado e não pode ser pago em um aplicativo bancário.
      </p>

      {isPending && (
        <div className="flex flex-col items-center gap-3 rounded-[4px] border border-border p-5">
          {payment.qrCodePayload && (
            <QRCodeSVG
              value={payment.qrCodePayload}
              size={160}
              level="M"
              includeMargin
              role="img"
              aria-label="Código QR do PIX simulado"
              className="max-w-full"
            />
          )}
          <p role="status" className="m-0 flex items-center gap-2 text-sm text-primary">
            <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
            Aguardando a confirmação do PIX.
          </p>
        </div>
      )}

      {isApproved && (
        <p role="status" className="m-0 text-sm text-primary">
          PIX aprovado. Atualizando a reserva...
        </p>
      )}

      {queryError && (
        <div className="border-l-4 border-destructive bg-destructive/10 p-4">
          <p role="alert" className="m-0 text-sm text-destructive">
            Não foi possível consultar o PIX simulado.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="mt-3 rounded-[4px]"
          >
            Consultar novamente
          </Button>
        </div>
      )}

      {creationError && !isPending && !isApproved && (
        <p role="alert" className="m-0 text-sm text-destructive">
          Não foi possível iniciar o PIX. Se houver um pagamento em andamento, aguarde a conclusão.
        </p>
      )}

      {!creationError && payment?.status === PaymentStatus.Failed && (
        <p role="alert" className="m-0 text-sm text-destructive">
          O PIX não foi concluído. Gere um novo QR ou escolha cartão.
        </p>
      )}

      <CheckoutActions>
        {cancelAction}
        {showGenerateAction && (
          <Button
            type="button"
            disabled={disabled || isChecking || isCreating || Boolean(queryError)}
            onClick={() => void handleCreate()}
            className="h-auto rounded-[4px] border-border py-3 text-sm font-semibold"
          >
            {isCreating ? 'Gerando QR...' : 'Gerar QR do PIX'}
          </Button>
        )}
      </CheckoutActions>
    </div>
  );
}
