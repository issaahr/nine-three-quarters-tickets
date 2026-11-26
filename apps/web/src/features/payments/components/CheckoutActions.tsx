import type { ReactNode } from 'react';

export function CheckoutActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:justify-center">
      {children}
    </div>
  );
}
