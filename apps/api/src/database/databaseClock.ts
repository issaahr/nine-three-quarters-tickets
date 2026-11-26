import { EntityManager } from 'typeorm';

/**
 * Lê o relógio do PostgreSQL em vez do instante fixado no início da transação.
 *
 * @param manager - Manager da transação, após a aquisição dos locks que protegem a decisão.
 * @returns Instante do banco para comparar com os prazos e registrar a transição.
 */
export async function getDatabaseClockTimestamp(manager: EntityManager): Promise<Date> {
  const [{ now }] = (await manager.query('SELECT clock_timestamp() AS "now"')) as Array<{
    now: Date;
  }>;
  return new Date(now);
}
