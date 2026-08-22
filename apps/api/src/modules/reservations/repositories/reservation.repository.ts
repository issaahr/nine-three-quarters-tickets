import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ReservationItem } from '../reservationItem.entity';
import { Reservation } from '../reservation.entity';
import { ReservationStatus } from '../reservationStatus.enum';
import { ReservationDetail } from './reservationRepository.interfaces';

interface ReservationStatusRow {
  reservationStatus: ReservationStatus;
}

/**
 * Concentra leituras de Reservation cujo estado temporal precisa ser calculado pelo PostgreSQL.
 */
@Injectable()
export class ReservationRepository {
  public constructor(
    @InjectRepository(Reservation)
    private readonly reservationsRepository: Repository<Reservation>,
    @InjectRepository(ReservationItem)
    private readonly reservationItemsRepository: Repository<ReservationItem>,
  ) {}

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
          WHEN "reservation"."confirmedAt" IS NOT NULL THEN '${ReservationStatus.Confirmed}'
          WHEN "reservation"."cancelledAt" IS NOT NULL THEN '${ReservationStatus.Cancelled}'
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
