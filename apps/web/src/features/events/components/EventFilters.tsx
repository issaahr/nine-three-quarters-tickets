import { Search, X } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { EventCategory, EventDiscoveryFilters } from '../types';

const allCategoriesValue = 'ALL';
const fieldClassName =
  'h-10 rounded-[4px] border-[#B8AEA0] bg-white px-3 text-sm focus-visible:border-primary';
const labelClassName =
  'mb-2 block text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground';

interface EventFiltersProps {
  filters: EventDiscoveryFilters;
  suggestedCities: string[];
  suggestedGenres: string[];
  onApply: (filters: EventDiscoveryFilters) => void;
}

/**
 * Mantém a edição dos filtros separada da consulta aplicada para evitar requisições a cada tecla.
 */
export function EventFilters({
  filters,
  suggestedCities,
  suggestedGenres,
  onApply,
}: EventFiltersProps) {
  const [query, setQuery] = useState(filters.query ?? '');
  const [category, setCategory] = useState<EventCategory | typeof allCategoriesValue>(
    filters.category ?? allCategoriesValue,
  );
  const [genre, setGenre] = useState(filters.genre ?? '');
  const [city, setCity] = useState(filters.city ?? '');
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(filters.dateTo ?? '');
  const [periodError, setPeriodError] = useState<string>();

  /**
   * Normaliza os valores opcionais e aplica todos os filtros em uma única consulta.
   *
   * @param event - Submissão explícita do formulário de descoberta.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }

    setPeriodError(undefined);
    onApply({
      query: query.trim().replace(/\s+/g, ' ') || undefined,
      category: category === allCategoriesValue ? undefined : category,
      genre: genre.trim().replace(/\s+/g, ' ') || undefined,
      city: city.trim().replace(/\s+/g, ' ') || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  }

  /** Limpa edição e consulta aplicada sem preservar filtros invisíveis. */
  function handleClear(): void {
    setQuery('');
    setCategory(allCategoriesValue);
    setGenre('');
    setCity('');
    setDateFrom('');
    setDateTo('');
    setPeriodError(undefined);
    onApply({});
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[#D8CEBE] bg-white p-4 [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_10px),calc(100%_-_10px)_100%,0_100%)] sm:p-5"
      aria-label="Busca e filtros de eventos"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(130px,0.8fr))]">
        <div>
          <label htmlFor="event-query" className={labelClassName}>
            Buscar
          </label>
          <Input
            id="event-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            placeholder="Título ou descrição"
            className={fieldClassName}
          />
        </div>

        <div>
          <label htmlFor="event-category" className={labelClassName}>
            Categoria
          </label>
          <Select<EventCategory | typeof allCategoriesValue>
            value={category}
            onValueChange={(value) =>
              setCategory(
                (value ?? allCategoriesValue) as EventCategory | typeof allCategoriesValue,
              )
            }
          >
            <SelectTrigger id="event-category" className="h-10">
              <SelectValue>
                {(value: EventCategory | typeof allCategoriesValue | null) =>
                  value === EventCategory.Movie
                    ? 'Filmes'
                    : value === EventCategory.Show
                      ? 'Shows'
                      : 'Todas'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allCategoriesValue}>Todas</SelectItem>
              <SelectItem value={EventCategory.Movie}>Filmes</SelectItem>
              <SelectItem value={EventCategory.Show}>Shows</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="event-genre" className={labelClassName}>
            Gênero
          </label>
          <Input
            id="event-genre"
            list="event-genre-suggestions"
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
            maxLength={100}
            placeholder="Todos"
            className={fieldClassName}
          />
          <datalist id="event-genre-suggestions">
            {suggestedGenres.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="event-city" className={labelClassName}>
            Cidade
          </label>
          <Input
            id="event-city"
            list="event-city-suggestions"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            maxLength={100}
            placeholder="Todas"
            className={fieldClassName}
          />
          <datalist id="event-city-suggestions">
            {suggestedCities.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mt-4 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(150px,0.6fr)_minmax(150px,0.6fr)_auto]">
        <div>
          <label htmlFor="event-date-from" className={labelClassName}>
            A partir de
          </label>
          <Input
            id="event-date-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)}
            className={fieldClassName}
          />
        </div>

        <div>
          <label htmlFor="event-date-to" className={labelClassName}>
            Até
          </label>
          <Input
            id="event-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
            className={fieldClassName}
          />
        </div>

        <div className="flex gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
          <Button type="submit" className="h-10 flex-1 rounded-[4px] px-5 xl:flex-none">
            <Search aria-hidden="true" />
            Aplicar filtros
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            className="h-10 rounded-[4px] px-4"
          >
            <X aria-hidden="true" />
            Limpar
          </Button>
        </div>
      </div>

      {periodError && (
        <p role="alert" className="mb-0 mt-3 text-sm text-destructive">
          {periodError}
        </p>
      )}
    </form>
  );
}
