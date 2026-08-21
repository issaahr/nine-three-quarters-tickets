import { Temporal } from '@js-temporal/polyfill';

import { InvalidEventStartError } from '../errors/invalidEventStart.error';
import { InvalidVenueTimeZoneError } from '../errors/invalidVenueTimeZone.error';

/**
 * Interpreta uma data local exclusivamente no timezone IANA persistido pelo Venue.
 * Horários inexistentes ou ambíguos em transições de offset são rejeitados.
 *
 * @param localDateTime - Data e hora locais sem offset, no formato aceito pelo DTO.
 * @param timeZone - Identificador IANA cuja validade pertence à configuração do Venue.
 * @returns Instante UTC correspondente, representado como `Date`.
 */
export function venueLocalDateTimeToDate(localDateTime: string, timeZone: string): Date {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone }).format();
  } catch (cause) {
    throw new InvalidVenueTimeZoneError(cause);
  }

  try {
    const instant = Temporal.PlainDateTime.from(localDateTime)
      .toZonedDateTime(timeZone, { disambiguation: 'reject' })
      .toInstant();

    return new Date(Number(instant.epochMilliseconds));
  } catch (cause) {
    throw new InvalidEventStartError(cause);
  }
}
