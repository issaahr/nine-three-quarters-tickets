import { ArrowLeft, Clapperboard, Music2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../../../lib/utils';
import { EventCategory } from '../../events/types';
import { CatalogPicker } from '../components/CatalogPicker';
import { EventForm } from '../components/EventForm';
import { CatalogItem } from '../types';

const eventTypeButtonClassName =
  'flex min-h-16 flex-1 items-center gap-3 rounded-[4px] border px-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Mantém a criação de MOVIE e SHOW como fluxos explícitos e mutuamente exclusivos.
 */
export function CreateEvent() {
  const [category, setCategory] = useState(EventCategory.Movie);
  const [selectedItem, setSelectedItem] = useState<CatalogItem>();
  const isShow = category === EventCategory.Show;

  function selectCategory(nextCategory: EventCategory): void {
    if (nextCategory === category) {
      return;
    }

    setCategory(nextCategory);
    setSelectedItem(undefined);
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-68px)] w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Link
        to="/organizer"
        className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Voltar para meus eventos
      </Link>

      <div className="mb-8 max-w-2xl">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[2px] text-primary">
          Novo evento
        </p>
        <h1 className="m-0 font-heading text-4xl font-semibold sm:text-5xl">
          Criar {isShow ? 'show' : 'sessão de cinema'}
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Escolha o tipo do evento e selecione o conteúdo no catálogo correspondente.
        </p>
      </div>

      <div className="mb-8 max-w-2xl" role="group" aria-label="Tipo de evento">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-muted-foreground">
          O que você quer criar?
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            aria-pressed={!isShow}
            onClick={() => selectCategory(EventCategory.Movie)}
            className={cn(
              eventTypeButtonClassName,
              !isShow
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:bg-muted',
            )}
          >
            <Clapperboard aria-hidden="true" />
            <span>
              <strong className="block font-heading text-lg">Filme</strong>
              <span
                className={cn(
                  'text-xs',
                  !isShow ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                Sessão com assentos marcados
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={isShow}
            onClick={() => selectCategory(EventCategory.Show)}
            className={cn(
              eventTypeButtonClassName,
              isShow
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:bg-muted',
            )}
          >
            <Music2 aria-hidden="true" />
            <span>
              <strong className="block font-heading text-lg">Show</strong>
              <span
                className={cn(
                  'text-xs',
                  isShow ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                Entrada geral por quantidade
              </span>
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)]">
        <div className="order-2 xl:order-1">
          <CatalogPicker
            key={category}
            category={category}
            selectedItem={selectedItem}
            onSelect={setSelectedItem}
          />
        </div>
        <div className="order-1 xl:order-2">
          <EventForm key={category} category={category} selectedItem={selectedItem} />
        </div>
      </div>
    </main>
  );
}
