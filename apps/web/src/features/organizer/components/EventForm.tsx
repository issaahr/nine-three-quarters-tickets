import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { NumericFormat } from 'react-number-format';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { EventCategory } from '../../events/types';
import { useCreateMovieEvent, useCreateShowEvent, usePublishEvent, useVenues } from '../hooks';
import { CreateEventFormValues, getCreateEventSchema } from '../schemas';
import { getVenueLocalDateTimeMinimum } from '../time/venueLocalDateTime';
import { CatalogItem } from '../types';

const fieldClassName =
  'h-11 rounded-[4px] border-border bg-card px-3 text-sm focus-visible:border-primary';
const labelClassName =
  'mb-2 block text-[11px] font-semibold uppercase tracking-[1.4px] text-muted-foreground';
const errorClassName = 'mt-1.5 block text-xs text-destructive';

interface EventFormProps {
  category: EventCategory;
  selectedItem?: CatalogItem;
}

/**
 * Valida os dados locais e coordena a criação e a publicação do Event selecionado.
 */
export function EventForm({ category, selectedItem }: EventFormProps) {
  const navigate = useNavigate();
  const [draftCreatedMessage, setDraftCreatedMessage] = useState<string>();
  const venuesQuery = useVenues(category);
  const createMovieMutation = useCreateMovieEvent();
  const createShowMutation = useCreateShowEvent();
  const publishMutation = usePublishEvent();
  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    register,
    formState: { errors, isValid },
  } = useForm<CreateEventFormValues>({
    resolver: zodResolver(getCreateEventSchema(category)),
    mode: 'onChange',
    defaultValues: {
      venueId: '',
      date: '',
      time: '',
      priceCents: undefined,
      capacity: undefined,
    },
  });
  const selectedVenueId = useWatch({ control, name: 'venueId' });
  const selectedDate = useWatch({ control, name: 'date' });
  const selectedTime = useWatch({ control, name: 'time' });
  const selectedVenue = venuesQuery.data?.find(({ id }) => id === selectedVenueId);
  const minimumDateTime = useMemo(
    () => (selectedVenue ? getVenueLocalDateTimeMinimum(selectedVenue.timeZone) : undefined),
    [selectedVenue],
  );
  const selectedDateTime =
    selectedDate && selectedTime ? `${selectedDate}T${selectedTime}` : undefined;
  const isFutureSelection =
    !!selectedDateTime && (!minimumDateTime || selectedDateTime >= minimumDateTime.value);
  const createMutation = category === EventCategory.Show ? createShowMutation : createMovieMutation;
  const isSubmitting = createMutation.isPending || publishMutation.isPending;

  useEffect(() => {
    if (!selectedDateTime || !minimumDateTime) {
      return;
    }

    if (selectedDateTime < minimumDateTime.value) {
      if (errors.date?.type !== 'future') {
        setError('date', {
          type: 'future',
          message: 'Data e/ou hora inválidas',
        });
      }
      return;
    }

    if (errors.date?.type === 'future') {
      clearErrors('date');
    }
  }, [clearErrors, errors.date?.type, minimumDateTime, selectedDateTime, setError]);

  /**
   * Cria o DRAFT e solicita sua publicação sem ocultar um rascunho recuperável em caso de falha.
   *
   * @param values - Dados locais validados pelo formulário.
   */
  async function onSubmit(values: CreateEventFormValues): Promise<void> {
    if (!selectedItem || !selectedVenue) {
      return;
    }

    const startsAtLocal = `${values.date}T${values.time}`;
    const currentMinimum = getVenueLocalDateTimeMinimum(selectedVenue.timeZone);

    if (startsAtLocal < currentMinimum.value) {
      setError('date', {
        type: 'future',
        message: 'Data e/ou hora inválidas',
      });
      return;
    }

    setDraftCreatedMessage(undefined);

    try {
      const event =
        category === EventCategory.Show
          ? await createShowMutation.mutateAsync({
              externalId: selectedItem.externalId,
              venueId: values.venueId,
              startsAtLocal,
              priceCents: values.priceCents,
              capacity: values.capacity!,
            })
          : await createMovieMutation.mutateAsync({
              externalId: selectedItem.externalId,
              venueId: values.venueId,
              startsAtLocal,
              priceCents: values.priceCents,
            });

      try {
        await publishMutation.mutateAsync(event.id);
        navigate('/organizer', { replace: true, state: { eventPublished: true } });
      } catch {
        setDraftCreatedMessage(
          'O evento foi salvo como rascunho, mas não pôde ser publicado. Você pode tentar novamente no painel.',
        );
      }
    } catch {
      // A falha de criação é anunciada a partir do estado da mutation.
    }
  }

  return (
    <section
      aria-labelledby="event-data-title"
      className="self-start border border-border bg-card p-5 [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_12px),calc(100%_-_12px)_100%,0_100%)] sm:p-6"
    >
      <h2 id="event-data-title" className="mt-0 font-heading text-2xl font-semibold">
        Dados do evento
      </h2>

      {selectedItem ? (
        <p className="mb-6 border-l-2 border-secondary py-1 pl-3 text-sm">
          {category === EventCategory.Show ? 'Atração' : 'Filme'} selecionado:{' '}
          <strong>{selectedItem.title}</strong>
        </p>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">
          Selecione {category === EventCategory.Show ? 'uma atração' : 'um filme'} para continuar.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label htmlFor="venueId" className={labelClassName}>
            {category === EventCategory.Show ? 'Local' : 'Local e sala'}
          </label>
          <Controller
            name="venueId"
            control={control}
            render={({ field }) => (
              <Select
                name={field.name}
                value={field.value || null}
                onValueChange={(value) => field.onChange(value ?? '')}
                inputRef={field.ref}
                required
                disabled={venuesQuery.isLoading || venuesQuery.isError}
              >
                <SelectTrigger
                  id="venueId"
                  onBlur={field.onBlur}
                  aria-required="true"
                  aria-invalid={!!errors.venueId}
                  aria-describedby={errors.venueId ? 'venue-error' : undefined}
                >
                  <SelectValue>
                    {(value: string | null) =>
                      value
                        ? (venuesQuery.data?.find((venue) => venue.id === value)?.name ?? value)
                        : venuesQuery.isLoading
                          ? 'Carregando locais...'
                          : 'Selecione um local'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {venuesQuery.data?.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id} label={venue.name}>
                      {venue.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.venueId?.message && (
            <span id="venue-error" role="alert" className={errorClassName}>
              {errors.venueId.message}
            </span>
          )}
          {venuesQuery.isError && (
            <span role="alert" className={errorClassName}>
              Não foi possível carregar os locais disponíveis.
            </span>
          )}
        </div>

        {category === EventCategory.Show && (
          <div>
            <label htmlFor="capacity" className={labelClassName}>
              Capacidade de entrada geral
            </label>
            <Input
              id="capacity"
              type="number"
              min={1}
              max={2_147_483_647}
              step={1}
              inputMode="numeric"
              required
              aria-required="true"
              aria-invalid={!!errors.capacity}
              aria-describedby={errors.capacity ? 'capacity-error' : 'capacity-hint'}
              className={fieldClassName}
              {...register('capacity', { valueAsNumber: true })}
            />
            {errors.capacity?.message ? (
              <span id="capacity-error" role="alert" className={errorClassName}>
                {errors.capacity.message}
              </span>
            ) : (
              <span id="capacity-hint" className="mt-1.5 block text-xs text-muted-foreground">
                Total de ingressos sem assento marcado disponíveis para este show.
              </span>
            )}
          </div>
        )}

        <div>
          <label htmlFor="venueAddress" className={labelClassName}>
            Endereço
          </label>
          <Input
            id="venueAddress"
            readOnly
            value={
              selectedVenue
                ? `${selectedVenue.address} · ${selectedVenue.city} · ${selectedVenue.state}`
                : ''
            }
            placeholder="Preenchido após escolher o local"
            className={`${fieldClassName} bg-muted/40 text-muted-foreground`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="date" className={labelClassName}>
              Data
            </label>
            <Input
              id="date"
              type="date"
              min={minimumDateTime?.date}
              required
              aria-required="true"
              aria-invalid={!!errors.date}
              aria-describedby={errors.date ? 'date-error starts-at-hint' : 'starts-at-hint'}
              className={fieldClassName}
              {...register('date')}
            />
            {errors.date?.message && (
              <span id="date-error" role="alert" className={errorClassName}>
                {errors.date.message}
              </span>
            )}
          </div>

          <div>
            <label htmlFor="time" className={labelClassName}>
              Horário local
            </label>
            <Input
              id="time"
              type="time"
              min={selectedDate === minimumDateTime?.date ? minimumDateTime.time : undefined}
              required
              aria-required="true"
              aria-invalid={!!errors.time || errors.date?.type === 'future'}
              aria-describedby={errors.time ? 'time-error starts-at-hint' : 'starts-at-hint'}
              className={fieldClassName}
              {...register('time')}
            />
            {errors.time?.message && (
              <span id="time-error" role="alert" className={errorClassName}>
                {errors.time.message}
              </span>
            )}
          </div>
        </div>
        <span id="starts-at-hint" className="-mt-3 block text-xs text-muted-foreground">
          {selectedVenue
            ? `Interpretado no fuso ${selectedVenue.timeZone}.`
            : 'O horário será interpretado no fuso do local selecionado.'}
        </span>

        <div>
          <label htmlFor="priceCents" className={labelClassName}>
            Preço por ingresso
          </label>
          <Controller
            name="priceCents"
            control={control}
            render={({ field }) => (
              <NumericFormat
                id="priceCents"
                customInput={Input}
                value={field.value === undefined ? '' : field.value / 100}
                onValueChange={({ floatValue }) =>
                  field.onChange(
                    floatValue === undefined ? undefined : Math.round(floatValue * 100),
                  )
                }
                onBlur={field.onBlur}
                getInputRef={field.ref}
                prefix="R$ "
                decimalSeparator=","
                allowedDecimalSeparators={[',', '.']}
                thousandSeparator="."
                decimalScale={2}
                fixedDecimalScale
                allowNegative={false}
                inputMode="decimal"
                placeholder="R$ 0,00"
                required
                aria-required="true"
                aria-invalid={!!errors.priceCents}
                aria-describedby={errors.priceCents ? 'price-error' : undefined}
                className={`${fieldClassName} font-mono`}
              />
            )}
          />
          {errors.priceCents?.message && (
            <span id="price-error" role="alert" className={errorClassName}>
              {errors.priceCents.message}
            </span>
          )}
        </div>

        {createMutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível criar o evento. Revise os dados e tente novamente.
          </p>
        )}

        {draftCreatedMessage && (
          <div role="alert" className="border-l-2 border-secondary py-1 pl-3 text-sm">
            {draftCreatedMessage}{' '}
            <Link to="/organizer" className="font-semibold text-primary underline">
              Ir para o painel
            </Link>
          </div>
        )}

        <Button
          type="submit"
          disabled={
            !selectedItem || !isValid || !isFutureSelection || isSubmitting || venuesQuery.isError
          }
          className="h-11 w-full rounded-[4px] text-sm font-semibold"
        >
          {isSubmitting ? 'Publicando...' : 'Publicar'}
        </Button>
      </form>
    </section>
  );
}
