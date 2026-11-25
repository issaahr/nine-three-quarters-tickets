import { type ReactNode } from 'react';
import { NavLink, type NavLinkProps } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { BrandLink } from './BrandLink';

interface SiteHeaderProps {
  brandPath: string;
  brandLabel: string;
  operational?: boolean;
  children: ReactNode;
}

export const siteHeaderActionClassName =
  'inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[4px] border border-brass-border bg-transparent px-3 text-[12px] text-primary-foreground transition-colors hover:bg-surface-dark-border hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

type SiteHeaderNavLinkProps = Pick<NavLinkProps, 'to' | 'end'> & {
  className?: string;
  children: ReactNode;
};

export function SiteHeaderNavLink({ to, end, className, children }: SiteHeaderNavLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'inline-flex h-9 items-center whitespace-nowrap rounded-[4px] px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
          isActive
            ? 'text-primary-foreground'
            : 'text-surface-dark-subtle hover:text-primary-foreground',
          className,
        )
      }
    >
      {children}
    </NavLink>
  );
}

export function SiteHeader({
  brandPath,
  brandLabel,
  operational = false,
  children,
}: SiteHeaderProps) {
  return (
    <header className={operational ? 'bg-surface-dark-deep' : 'bg-secondary-foreground'}>
      <div
        className={cn(
          'flex min-h-[68px] w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-6 lg:px-12 2xl:px-16',
          operational ? 'border-surface-dark-border' : 'border-transparent',
        )}
      >
        <BrandLink to={brandPath} ariaLabel={brandLabel} />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-4">
          {children}
        </div>
      </div>
    </header>
  );
}
