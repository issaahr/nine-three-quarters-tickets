import { Injectable } from '@nestjs/common';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { Ticket } from '../ticket.entity';

/** Operações de persistência que preservam a unicidade das credenciais de Ticket. */
@Injectable()
export class TicketRepository {
  public constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
  ) {}

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

  /**
   * Carrega os Tickets confirmados de um CUSTOMER com todos os dados necessários para apresentação.
   *
   * @param customerId - Identidade do CUSTOMER proprietário das compras.
   * @param reservationId - Compra opcional que deve restringir a consulta.
   * @returns Tickets ordenados por compra e emissão, sem recursos de outro CUSTOMER.
   */
  public findConfirmedByCustomer(customerId: string, reservationId?: string): Promise<Ticket[]> {
    const queryBuilder = this.createPresentationQuery()
      .where('"reservation"."customerId" = :customerId', { customerId })
      .andWhere('"reservation"."confirmedAt" IS NOT NULL')
      .orderBy('"reservation"."confirmedAt"', 'DESC')
      .addOrderBy('"ticket"."createdAt"', 'ASC');

    if (reservationId) {
      queryBuilder.andWhere('"reservation"."id" = :reservationId', { reservationId });
    }

    return queryBuilder.getMany();
  }

  /**
   * Carrega um Ticket individual por publicId para apresentação de uma credencial já verificada.
   *
   * @param publicId - Identificador público autorizado pela assinatura HMAC.
   * @returns Ticket atual com contexto do Event ou null quando não existir.
   */
  public findPresentationByPublicId(publicId: string): Promise<Ticket | null> {
    return this.createPresentationQuery()
      .where('"ticket"."publicId" = :publicId', { publicId })
      .andWhere('"reservation"."confirmedAt" IS NOT NULL')
      .getOne();
  }

  private createPresentationQuery(): SelectQueryBuilder<Ticket> {
    return this.ticketsRepository
      .createQueryBuilder('ticket')
      .innerJoinAndSelect('ticket.reservationItem', 'reservationItem')
      .innerJoinAndSelect('reservationItem.reservation', 'reservation')
      .innerJoinAndSelect('reservation.event', 'event')
      .innerJoinAndSelect('event.venue', 'venue')
      .leftJoinAndSelect('reservationItem.eventSeat', 'eventSeat')
      .leftJoinAndSelect('eventSeat.venueSeat', 'venueSeat');
  }
}
