import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { EventSeat } from '../../events/eventSeat.entity';
import { ReservationItem } from '../reservationItem.entity';
import { Reservation } from '../reservation.entity';
import { ReservationStatus } from '../reservationStatus.enum';
import { Ticket } from '../../tickets/ticket.entity';
import {
  AcquireEventSeatsParameters,
  ReleasedEventSeatRow,
  ReservationDetail,
} from './reservationRepository.interfaces';

interface ReservationStatusRow {
  reservationStatus: ReservationStatus;
}

/** Concentra consultas semânticas e escritas condicionais do lifecycle de Reservations. */
@Injectable()
export class ReservationRepository {
  public constructor(
    @InjectRepository(Reservation)
    private readonly reservationsRepository: Repository<Reservation>,
    @InjectRepository(ReservationItem)
    private readonly reservationItemsRepository: Repository<ReservationItem>,
  ) {}

  /**
   * Adquire todos os EventSeats elegíveis por uma única escrita condicional dentro da transaction.
   *
   * @param manager - EntityManager vinculado à transaction da Reservation.
   * @param parameters - Identificadores e timestamps autoritativos usados na aquisição.
   * @returns Quantidade de EventSeats adquiridos pela escrita condicional.
   */
  public async acquireEventSeats(
    manager: EntityManager,
    parameters: AcquireEventSeatsParameters,
  ): Promise<number> {
    const result = await manager
      .getRepository(EventSeat)
      .createQueryBuilder()
      .update(EventSeat)
      .set({
        holdReservationId: parameters.reservationId,
        holdExpiresAt: parameters.expiresAt,
      })
      .where('"id" IN (:...eventSeatIds)', { eventSeatIds: parameters.eventSeatIds })
      .andWhere('"eventId" = :eventId', { eventId: parameters.eventId })
      .andWhere('"soldAt" IS NULL')
      .andWhere('("holdReservationId" IS NULL OR "holdExpiresAt" <= :now)', {
        now: parameters.now,
      })
      .execute();

    return result.affected ?? 0;
  }

  /**
   * Libera somente os EventSeats cujo hold ainda pertence à Reservation informada.
   *
   * @param manager - EntityManager vinculado à transaction de cancelamento.
   * @param reservationId - Reservation proprietária dos holds que devem ser liberados.
   * @returns Identificadores dos EventSeats efetivamente alterados.
   */
  public async releaseHeldEventSeats(
    manager: EntityManager,
    reservationId: string,
  ): Promise<string[]> {
    const result = await manager
      .getRepository(EventSeat)
      .createQueryBuilder()
      .update(EventSeat)
      .set({ holdReservationId: null, holdExpiresAt: null })
      .where('"holdReservationId" = :reservationId', { reservationId })
      .returning('"id"')
      .execute();

    return (result.raw as ReleasedEventSeatRow[]).map(({ id }) => id);
  }

  /**
   * Cancela Tickets ainda utilizáveis para impedir que uma alteração concorrente os invalide parcialmente.
   *
   * @param manager - EntityManager vinculado à transação de cancelamento.
   * @param reservationItemIds - Itens cujos Tickets devem ser cancelados.
   * @param cancelledAt - Instante autoritativo que marca o cancelamento.
   * @returns Quantidade de Tickets efetivamente cancelados.
   */
  public async cancelTickets(
    manager: EntityManager,
    reservationItemIds: string[],
    cancelledAt: Date,
  ): Promise<number> {
    const result = await manager
      .getRepository(Ticket)
      .createQueryBuilder()
      .update(Ticket)
      .set({ cancelledAt })
      .where('"reservationItemId" IN (:...reservationItemIds)', { reservationItemIds })
      .andWhere('"checkedInAt" IS NULL')
      .andWhere('"cancelledAt" IS NULL')
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Libera assentos vendidos somente quando todos ainda representam a venda cancelada.
   *
   * @param manager - EntityManager vinculado à transação de cancelamento.
   * @param eventSeatIds - Assentos vendidos pelos itens cancelados.
   * @returns Identificadores dos assentos efetivamente liberados.
   */
  public async releaseSoldEventSeats(
    manager: EntityManager,
    eventSeatIds: string[],
  ): Promise<string[]> {
    if (eventSeatIds.length === 0) return [];
    const result = await manager
      .getRepository(EventSeat)
      .createQueryBuilder()
      .update(EventSeat)
      .set({ soldAt: null, holdReservationId: null, holdExpiresAt: null })
      .where('"id" IN (:...eventSeatIds)', { eventSeatIds })
      .andWhere('"soldAt" IS NOT NULL')
      .returning('"id"')
      .execute();
    return (result.raw as ReleasedEventSeatRow[]).map(({ id }) => id);
  }

  /**
   * Carrega uma Reservation do CUSTOMER com seus itens, sem revelar recursos de outro usuário.
   *
   * @param customerId - Identificador do CUSTOMER que deve possuir a Reservation.
   * @param reservationId - Identificador da Reservation consultada.
   * @returns A Reservation detalhada ou null quando ela não pertence ao CUSTOMER.
   */
  public findOwnedDetail(
    customerId: string,
    reservationId: string,
  ): Promise<ReservationDetail | null> {
    return this.findDetail((queryBuilder) =>
      queryBuilder
        .where('"reservation"."id" = :reservationId', { reservationId })
        .andWhere('"reservation"."customerId" = :customerId', { customerId }),
    );
  }

  /**
   * Carrega a única Reservation ativa do CUSTOMER para uma ocorrência, caso ainda não tenha expirado.
   *
   * @param customerId - Identificador do CUSTOMER que possui a Reservation.
   * @param eventId - Identificador da ocorrência da Reservation procurada.
   * @returns A Reservation ativa detalhada ou null quando não existir uma.
   */
  public findActiveByCustomerAndEvent(
    customerId: string,
    eventId: string,
  ): Promise<ReservationDetail | null> {
    return this.findDetail((queryBuilder) =>
      queryBuilder
        .where('"reservation"."customerId" = :customerId', { customerId })
        .andWhere('"reservation"."eventId" = :eventId', { eventId })
        .andWhere('"reservation"."confirmedAt" IS NULL')
        .andWhere('"reservation"."cancelledAt" IS NULL')
        .andWhere('"reservation"."expiresAt" > CURRENT_TIMESTAMP'),
    );
  }

  /**
   * Executa uma consulta de Reservation já restrita pelo chamador e calcula seu estado temporal no PostgreSQL.
   *
   * @param configure - Restrição semântica aplicada à consulta base de Reservation.
   * @returns A Reservation com itens e estado derivado, ou null quando a consulta não encontrar resultado.
   */
  private async findDetail(
    configure: (queryBuilder: ReturnType<Repository<Reservation>['createQueryBuilder']>) => void,
  ): Promise<ReservationDetail | null> {
    const queryBuilder = this.reservationsRepository.createQueryBuilder('reservation').addSelect(
      `CASE
          WHEN "reservation"."cancelledAt" IS NOT NULL THEN '${ReservationStatus.Cancelled}'
          WHEN "reservation"."confirmedAt" IS NOT NULL THEN '${ReservationStatus.Confirmed}'
          WHEN "reservation"."expiresAt" <= CURRENT_TIMESTAMP THEN '${ReservationStatus.Expired}'
          ELSE '${ReservationStatus.Active}'
        END`,
      'reservationStatus',
    );
    configure(queryBuilder);
    const result = await queryBuilder.getRawAndEntities();
    const reservation = result.entities[0];

    if (!reservation) {
      return null;
    }

    const items = await this.reservationItemsRepository.find({
      where: { reservationId: reservation.id },
      order: { createdAt: 'ASC' },
    });

    return {
      reservation,
      items,
      status: (result.raw[0] as ReservationStatusRow).reservationStatus,
    };
  }
}
