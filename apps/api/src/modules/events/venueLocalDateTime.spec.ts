import { InvalidEventStartError } from './errors/invalidEventStart.error';
import { InvalidVenueTimeZoneError } from './errors/invalidVenueTimeZone.error';
import { venueLocalDateTimeToDate } from './venueLocalDateTime';

describe('venueLocalDateTimeToDate', () => {
  it('interpreta o horário local no timezone IANA do Venue', () => {
    expect(venueLocalDateTimeToDate('2026-09-01T20:30', 'America/Sao_Paulo')).toEqual(
      new Date('2026-09-01T23:30:00.000Z'),
    );
  });

  it.each(['2026-03-08T02:30', '2026-11-01T01:30'])(
    'rejeita horário inexistente ou ambíguo em transição de offset: %s',
    (localDateTime) => {
      expect(() => venueLocalDateTimeToDate(localDateTime, 'America/New_York')).toThrow(
        InvalidEventStartError,
      );
    },
  );

  it('rejeita timezone inválido persistido no Venue', () => {
    expect(() => venueLocalDateTimeToDate('2026-09-01T20:30', 'Invalid/Zone')).toThrow(
      InvalidVenueTimeZoneError,
    );
  });
});
