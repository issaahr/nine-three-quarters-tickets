import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { MovieCatalogPicker } from '../components/MovieCatalogPicker';
import { MovieEventForm } from '../components/MovieEventForm';
import { CatalogItem } from '../types';

/**
 * Compõe a escolha do filme e os dados locais necessários para publicar uma sessão.
 */
export function CreateMovieEvent() {
  const [selectedMovie, setSelectedMovie] = useState<CatalogItem>();

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
          Nova sessão de cinema
        </p>
        <h1 className="m-0 font-heading text-4xl font-semibold sm:text-5xl">
          Criar sessão de cinema
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Escolha para qual filme deseja criar uma sessão
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)]">
        <div className="order-2 xl:order-1">
          <MovieCatalogPicker selectedMovie={selectedMovie} onSelect={setSelectedMovie} />
        </div>
        <div className="order-1 xl:order-2">
          <MovieEventForm selectedMovie={selectedMovie} />
        </div>
      </div>
    </main>
  );
}
