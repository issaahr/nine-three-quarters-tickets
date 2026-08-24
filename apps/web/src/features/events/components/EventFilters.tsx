import { SlidersHorizontal, Search, X } from 'lucide-react';
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
import { EventDiscoveryFilters } from '../types';

const allGenresValue = 'ALL';
const fieldClassName =
  'h-10 rounded-[4px] border-border-input bg-white px-3 text-sm focus-visible:border-primary';
const labelClassName =
  'mb-2 block text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground';

interface EventFiltersProps {
  filters: EventDiscoveryFilters;
  suggestedGenres: string[];
  onApply: (filters: EventDiscoveryFilters) => void;
}

/** Mantém a edição dos filtros separada da consulta aplicada. */
export function EventFilters({ filters, suggestedGenres, onApply }: EventFiltersProps) {
  const [query, setQuery] = useState(filters.query ?? '');
  const [genre, setGenre] = useState(filters.genre ?? '');
  const [city, setCity] = useState(filters.city ?? '');
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(filters.dateTo ?? '');
  const [periodError, setPeriodError] = useState<string>();
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedGenre = suggestedGenres.includes(genre) ? genre : '';

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setPeriodError('A data inicial não pode ser posterior à data final.');
      return;
    }

    setPeriodError(undefined);
    onApply({
      query: query.trim().replace(/\s+/g, ' ') || undefined,
      category: filters.category,
      genre: selectedGenre.trim().replace(/\s+/g, ' ') || undefined,
      city: city.trim().replace(/\s+/g, ' ') || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  }

  function handleClear(): void {
    setQuery('');
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
      className="border border-border-clip bg-white p-4 [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_10px),calc(100%_-_10px)_100%,0_100%)] sm:p-5"
      aria-label="Busca e filtros de eventos"
    >
      {!isExpanded ? (
        <div className="flex flex-wrap gap-2">
          <div className="min-w-48 flex-1">
            <label htmlFor="event-query" className="sr-only">
              Buscar
            </label>
            <Input
              id="event-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={100}
              placeholder="Buscar eventos"
              className={fieldClassName}
            />
          </div>
          <Button type="submit" className="h-10 rounded-[4px] px-4">
            <Search aria-hidden="true" />
            Buscar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsExpanded(true)}
            className="h-10 rounded-[4px] px-4"
            aria-expanded="false"
          >
            <SlidersHorizontal aria-hidden="true" />
            Filtros
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(2,minmax(130px,0.8fr))]">
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
              <label htmlFor="event-genre" className={labelClassName}>
                Gênero
              </label>
              <Select<string>
                value={selectedGenre || allGenresValue}
                onValueChange={(value) => setGenre(value === allGenresValue || !value ? '' : value)}
              >
                <SelectTrigger id="event-genre" className="h-10">
                  <SelectValue>
                    {(value: string | null) =>
                      value === allGenresValue || !value ? 'Todos' : value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={allGenresValue}>Todos</SelectItem>
                  {suggestedGenres.map((suggestion) => (
                    <SelectItem key={suggestion} value={suggestion}>
                      {suggestion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="event-city" className={labelClassName}>
                Cidade
              </label>
              <Input
                id="event-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                maxLength={100}
                placeholder="Todas"
                className={fieldClassName}
              />
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
            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsExpanded(false)}
                className="h-10 rounded-[4px] px-4"
              >
                Ocultar filtros
              </Button>
            </div>
          </div>
        </>
      )}
      {periodError && (
        <p role="alert" className="mb-0 mt-3 text-sm text-destructive">
          {periodError}
        </p>
      )}
    </form>
  );
}
