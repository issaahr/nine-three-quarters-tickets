import { CreditCard, QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PaymentMethod } from '../types';

interface CheckoutPaymentMethodsProps {
  methods: PaymentMethod[];
  selectedMethod: PaymentMethod | undefined;
  onSelect: (method: PaymentMethod) => void;
  disabled: boolean;
  simulated?: boolean;
}

const methodPresentation = {
  [PaymentMethod.Card]: { Icon: CreditCard, label: 'Cartão de crédito' },
  [PaymentMethod.Pix]: { Icon: QrCode, label: 'Pix' },
};

export function CheckoutPaymentMethods({
  methods,
  selectedMethod,
  onSelect,
  disabled,
  simulated,
}: CheckoutPaymentMethodsProps) {
  return (
    <div
      role="group"
      aria-label="Método de pagamento"
      className="mt-5 grid gap-3 min-[420px]:grid-cols-2"
    >
      {methods.map((method) => {
        const { Icon, label } = methodPresentation[method];
        const selected = selectedMethod === method;
        return (
          <Button
            key={method}
            type="button"
            variant={selected ? 'default' : 'outline'}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onSelect(method)}
            className="h-auto rounded-[4px] py-3"
          >
            <Icon aria-hidden="true" />
            {simulated && method === PaymentMethod.Pix ? 'PIX simulado' : label}
          </Button>
        );
      })}
    </div>
  );
}
