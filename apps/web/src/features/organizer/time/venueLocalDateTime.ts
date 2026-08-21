import { VenueLocalDateTimeMinimum } from './venueLocalDateTime.interfaces';

/**
 * Produz o primeiro minuto futuro selecionável no timezone canônico do Venue.
 *
 * @param timeZone - Identificador IANA persistido para o Venue.
 * @param now - Instante de referência, injetável para testes determinísticos.
 * @returns Data, horário e valor combinado no formato dos inputs nativos.
 */
export function getVenueLocalDateTimeMinimum(
  timeZone: string,
  now = new Date(),
): VenueLocalDateTimeMinimum {
  const nextMinute = new Date(now.getTime() + 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(nextMinute);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  const date = `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
  const time = `${values.get('hour')}:${values.get('minute')}`;

  return { date, time, value: `${date}T${time}` };
}
