import { NavLink } from 'react-router-dom';

interface BrandLinkProps {
  to: string;
  ariaLabel: string;
}

/** Reutiliza a assinatura visual da marca nas superfícies públicas e autenticadas. */
export function BrandLink({ to, ariaLabel }: BrandLinkProps) {
  return (
    <NavLink
      to={to}
      className="inline-flex flex-col items-center gap-[5px] rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
      aria-label={ariaLabel}
    >
      <span className="flex items-baseline gap-[9px]">
        <span className="font-heading text-[24px] font-semibold leading-none text-primary-foreground">
          9¾
        </span>
        <span className="text-[10px] font-medium tracking-[2.4px] text-primary-foreground">
          TICKETS
        </span>
      </span>
      <span className="flex gap-[4px]" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className="size-[2.5px] rounded-full bg-secondary" />
        ))}
      </span>
    </NavLink>
  );
}
