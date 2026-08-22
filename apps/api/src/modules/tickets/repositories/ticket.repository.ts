import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { Ticket } from '../ticket.entity';

/** Operações de persistência que preservam a unicidade das credenciais de Ticket. */
@Injectable()
export class TicketRepository {
  /**
   * Localiza o Ticket já emitido para um ReservationItem dentro da transaction atual.
   *
   * @param manager - Manager vinculado à transaction que confirma a Reservation.
   * @param reservationItemId - Unidade de compra que pode possuir no máximo um Ticket.
   * @returns Ticket existente ou null quando a emissão ainda é necessária.
   */
  public findByReservationItemId(
    manager: EntityManager,
    reservationItemId: string,
  ): Promise<Ticket | null> {
    return manager.getRepository(Ticket).findOneBy({ reservationItemId });
  }

  /**
   * Insere um Ticket sem abortar a transaction quando uma credencial aleatória colidir.
   *
   * @param manager - Manager vinculado à transaction que confirma a Reservation.
   * @param reservationItemId - Unidade de compra que receberá o Ticket.
   * @param publicId - Identificador público aleatório candidato.
   * @param manualCode - Código manual candidato apresentado ao cliente.
   * @param issuedAt - Instante autoritativo do PostgreSQL da emissão.
   * @returns true quando a inserção ocorreu ou false quando alguma constraint de unicidade conflitou.
   */
  public async insertIgnoringCredentialConflict(
    manager: EntityManager,
    reservationItemId: string,
    publicId: string,
    manualCode: string,
    issuedAt: Date,
  ): Promise<boolean> {
    const result = await manager
      .getRepository(Ticket)
      .createQueryBuilder()
      .insert()
      .into(Ticket)
      .values({ reservationItemId, publicId, manualCode, issuedAt })
      .orIgnore()
      .execute();

    return result.identifiers.length === 1;
  }
}
