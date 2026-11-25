import { Clapperboard, ScanLine, Ticket } from 'lucide-react';
import { Link, Outlet, useMatch } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { SiteHeader, siteHeaderActionClassName } from '../navigation/components/SiteHeader';

const journeys = [
  {
    label: 'Cliente',
    description: 'Explore o catálogo e entre ou crie uma conta para comprar.',
    icon: Ticket,
    path: '/events',
  },
  {
    label: 'Organizador',
    description: 'Navegue pelos eventos publicados na visão do organizador.',
    icon: Clapperboard,
    path: '/demo/organizer',
  },
  {
    label: 'Portaria',
    description: 'Consulte os eventos disponíveis e abra o contexto da portaria.',
    icon: ScanLine,
    path: '/demo/gate',
  },
] as const;

export function DemoLayout() {
  const isGate = Boolean(useMatch('/demo/gate/*'));
  const isIndex = Boolean(useMatch('/demo'));
  const backLabel = isIndex ? 'Voltar ao catálogo' : 'Voltar à demonstração';

  return (
    <div
      className={cn(
        'min-h-screen',
        isGate ? 'bg-surface-dark text-background' : 'bg-background text-foreground',
      )}
    >
      <SiteHeader
        operational={isGate}
        brandPath="/events"
        brandLabel="9¾ Tickets — catálogo de eventos"
      >
        <nav
          aria-label="Navegação da demonstração"
          className="flex flex-wrap justify-end gap-2 sm:gap-4"
        >
          <Link
            to={isIndex ? '/events' : '/demo'}
            className={siteHeaderActionClassName}
            aria-label={backLabel}
          >
            <span className="sm:hidden">Voltar</span>
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
          <Link to="/login" className={siteHeaderActionClassName}>
            Entrar
          </Link>
        </nav>
      </SiteHeader>
      <Outlet />
    </div>
  );
}

export function DemoPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="m-0 font-heading text-4xl font-semibold sm:text-5xl">
        Experimente o 9¾ Tickets
      </h1>
      <p className="mb-0 mt-3 max-w-xl text-muted-foreground">
        Explore o catálogo ou visite as áreas de organizador e portaria em modo de leitura.
      </p>

      <nav aria-label="Percursos da demonstração" className="my-7 grid gap-3 sm:grid-cols-3">
        {journeys.map(({ label, description, icon: Icon, path }) => (
          <Link
            key={path}
            to={path}
            className="flex items-start gap-3 rounded-[4px] border border-border-panel bg-card p-4 text-inherit no-underline hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            <span>
              <strong className="block font-heading text-xl">{label}</strong>
              <span className="mt-1 block text-sm">{description}</span>
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
