export interface ReservationCountdown {
  totalSeconds: number;
  formatted: string;
}

/**
 * Deriva a contagem visual do timestamp persistido, sem conferir autoridade ao relógio do browser.
 *
 * O arredondamento para cima evita exibir zero enquanto ainda resta uma fração positiva de segundo.
 */
export function getReservationCountdown(
  expiresAt: string,
  currentTimestamp: number,
): ReservationCountdown {
  const remainingMilliseconds = new Date(expiresAt).getTime() - currentTimestamp;
  const totalSeconds = Math.max(0, Math.ceil(remainingMilliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    totalSeconds,
    formatted: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  };
}
