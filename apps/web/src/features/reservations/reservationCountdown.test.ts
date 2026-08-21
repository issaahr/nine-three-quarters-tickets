import { describe, expect, it } from 'vitest';

import { getReservationCountdown } from './reservationCountdown';

describe('countdown de Reservation', () => {
  const reference = Date.parse('2030-08-25T22:30:00.000Z');

  it('deriva minutos e segundos do expiresAt persistido', () => {
    expect(getReservationCountdown('2030-08-25T22:40:05.000Z', reference)).toEqual({
      totalSeconds: 605,
      formatted: '10:05',
    });
  });

  it('arredonda uma fração positiva para não antecipar visualmente a expiração', () => {
    expect(getReservationCountdown('2030-08-25T22:30:01.001Z', reference)).toEqual({
      totalSeconds: 2,
      formatted: '00:02',
    });
  });

  it('nunca apresenta tempo negativo após o expiresAt', () => {
    expect(getReservationCountdown('2030-08-25T22:29:59.000Z', reference)).toEqual({
      totalSeconds: 0,
      formatted: '00:00',
    });
  });
});
