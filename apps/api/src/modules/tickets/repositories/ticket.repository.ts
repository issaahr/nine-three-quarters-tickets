import { Injectable } from '@nestjs/common';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { Reservation } from '../../reservations/reservation.entity';
import { Ticket } from '../ticket.entity';

const ticketPurchasesPageSize = 10;

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
   * Obtém a lista paginada de IDs de reservas confirmadas do CUSTOMER.
   *
   * @param customerId - Identidade do CUSTOMER proprietário das compras.
   * @param filters - Página e filtro opcional de reservationId.
   * @returns IDs de reservas da página atual e indicador determinístico de hasMore.
   */
  public async findConfirmedPurchasesByCustomer(
    customerId: string,
    filters: { page: number; reservationId?: string },
  ): Promise<{ reservationIds: string[]; page: number; hasMore: boolean }> {
    const page = filters.page > 0 ? filters.page : 1;
    const queryBuilder = this.ticketsRepository.manager
      .getRepository(Reservation)
      .createQueryBuilder('reservation')
      .select('reservation.id', 'id')
      .where('reservation.customerId = :customerId', { customerId })
      .andWhere('reservation.confirmedAt IS NOT NULL')
      .orderBy('reservation.confirmedAt', 'DESC')
      .addOrderBy('reservation.id', 'DESC');

    if (filters.reservationId) {
      queryBuilder.andWhere('reservation.id = :reservationId', {
        reservationId: filters.reservationId,
      });
    }

    const rows = await queryBuilder
      .skip((page - 1) * ticketPurchasesPageSize)
      .take(ticketPurchasesPageSize + 1)
      .getRawMany<{ id: string }>();

    const hasMore = rows.length > ticketPurchasesPageSize;
    const pagedRows = hasMore ? rows.slice(0, ticketPurchasesPageSize) : rows;
    const reservationIds = pagedRows.map((row) => row.id);

    return {
      reservationIds,
      page,
      hasMore,
    };
  }

  /**
   * Carrega os Tickets pertencentes a um conjunto de reservas confirmadas com relações completas.
   *
   * @param reservationIds - IDs de reservas confirmadas.
   * @returns Tickets ordenados por compra e emissão.
   */
  public async findTicketsByReservationIds(reservationIds: string[]): Promise<Ticket[]> {
    if (reservationIds.length === 0) {
      return [];
    }

    return this.createPresentationQuery()
      .where('"reservation"."id" IN (:...reservationIds)', { reservationIds })
      .orderBy('"reservation"."confirmedAt"', 'DESC')
      .addOrderBy('"reservation"."id"', 'DESC')
      .addOrderBy('"ticket"."createdAt"', 'ASC')
      .getMany();
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

  /**
   * Carrega o Ticket e seu Event para decidir o resultado semântico do check-in.
   *
   * @param publicId - Identificador público obtido de uma credencial QR já validada.
   * @returns Ticket confirmado com o contexto do Event ou null quando não existir.
   */
  public findForCheckInByPublicId(publicId: string): Promise<Ticket | null> {
    return this.createCheckInQuery()
      .where('"ticket"."publicId" = :publicId', { publicId })
      .getOne();
  }

  /**
   * Carrega o Ticket e seu Event pelo código manual já normalizado.
   *
   * @param manualCode - Código manual no formato canônico persistido.
   * @returns Ticket confirmado com o contexto do Event ou null quando não existir.
   */
  public findForCheckInByManualCode(manualCode: string): Promise<Ticket | null> {
    return this.createCheckInQuery()
      .where('"ticket"."manualCode" = :manualCode', { manualCode })
      .getOne();
  }

  /**
   * Recarrega o estado corrente depois que uma escrita condicional perde a disputa.
   *
   * @param ticketId - Identificador interno do Ticket consultado anteriormente.
   * @returns Ticket confirmado com seu estado corrente ou null quando não existir.
   */
  public findForCheckInById(ticketId: string): Promise<Ticket | null> {
    return this.createCheckInQuery().where('"ticket"."id" = :ticketId', { ticketId }).getOne();
  }

  /**
   * Registra o uso uma única vez, sem depender de uma leitura anterior como garantia de concorrência.
   *
   * @param ticketId - Identificador interno do Ticket que deve receber o check-in.
   * @param gateUserId - Identificador do operador GATE responsável pela tentativa.
   * @returns true quando a escrita condicional registrou o check-in ou false quando o Ticket deixou de ser elegível.
   */
  public async markCheckedIn(ticketId: string, gateUserId: string): Promise<boolean> {
    const result = await this.ticketsRepository
      .createQueryBuilder()
      .update(Ticket)
      .set({
        checkedInAt: () => 'CURRENT_TIMESTAMP',
        checkedInByUserId: gateUserId,
      })
      .where('"id" = :ticketId', { ticketId })
      .andWhere('"checkedInAt" IS NULL')
      .andWhere('"cancelledAt" IS NULL')
      .execute();

    return result.affected === 1;
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

  private createCheckInQuery(): SelectQueryBuilder<Ticket> {
    return this.ticketsRepository
      .createQueryBuilder('ticket')
      .innerJoinAndSelect('ticket.reservationItem', 'reservationItem')
      .innerJoinAndSelect('reservationItem.reservation', 'reservation')
      .innerJoinAndSelect('reservation.event', 'event')
      .andWhere('"reservation"."confirmedAt" IS NOT NULL');
  }
}
