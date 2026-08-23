import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, MoreThan, Repository } from 'typeorm';

import { AdmissionMode } from '../../events/admissionMode.enum';
import { Event } from '../../events/event.entity';
import { EventSeat } from '../../events/eventSeat.entity';
import { EventStatus } from '../../events/eventStatus.enum';
import { EventNotFoundError } from '../../events/errors/eventNotFound.error';
import { ActiveReservationExistsError } from '../errors/activeReservationExists.error';
import { EventAlreadyStartedError } from '../errors/eventAlreadyStarted.error';
import { EventCannotBeReservedError } from '../errors/eventCannotBeReserved.error';
import { GeneralAdmissionCapacityUnavailableError } from '../errors/generalAdmissionCapacityUnavailable.error';
import { ReservationItem } from '../reservationItem.entity';
import { Reservation } from '../reservation.entity';
import { ReservationStatus } from '../reservationStatus.enum';
import { Ticket } from '../../tickets/ticket.entity';
import {
  AcquireEventSeatsParameters,
  CreateGeneralAdmissionReservationParameters,
  DatabaseTimestampRow,
  GeneralAdmissionReservationCreationResult,
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
    private readonly dataSource: DataSource,
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
   * Executa integralmente a aquisição GA na transação que serializa a capacidade do Event.
   *
   * @param parameters - Identidade, ocorrência, quantidade e duração autoritativa do hold.
   * @returns Reservation e itens persistidos no mesmo commit da aquisição de capacidade.
   */
  public createGeneralAdmission(
    parameters: CreateGeneralAdmissionReservationParameters,
  ): Promise<GeneralAdmissionReservationCreationResult> {
    return this.dataSource.transaction(async (manager) => {
      const eventsRepository = manager.getRepository(Event);
      const reservationsRepository = manager.getRepository(Reservation);
      const reservationItemsRepository = manager.getRepository(ReservationItem);
      const now = await this.getDatabaseTimestamp(manager);
      const expiresAt = new Date(now.getTime() + parameters.holdDurationSeconds * 1000);
      const event = await eventsRepository.findOne({
        where: { id: parameters.eventId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!event) {
        throw new EventNotFoundError();
      }

      if (
        event.status !== EventStatus.Published ||
        event.admissionMode !== AdmissionMode.GeneralAdmission ||
        event.capacity === null
      ) {
        throw new EventCannotBeReservedError();
      }

      if (event.startsAt.getTime() <= now.getTime()) {
        throw new EventAlreadyStartedError();
      }

      const activeReservation = await reservationsRepository.findOne({
        select: { id: true },
        where: {
          customerId: parameters.customerId,
          eventId: event.id,
          confirmedAt: IsNull(),
          cancelledAt: IsNull(),
          expiresAt: MoreThan(now),
        },
      });

      if (activeReservation) {
        throw new ActiveReservationExistsError();
      }

      const occupiedQuantity = await this.countOccupiedGeneralAdmissionItems(
        manager,
        event.id,
        now,
      );

      if (occupiedQuantity + parameters.quantity > event.capacity) {
        throw new GeneralAdmissionCapacityUnavailableError();
      }

      const reservation = await reservationsRepository.save(
        reservationsRepository.create({
          customerId: parameters.customerId,
          eventId: event.id,
          expiresAt,
          confirmedAt: null,
          cancelledAt: null,
        }),
      );
      const items = await reservationItemsRepository.save(
        Array.from({ length: parameters.quantity }, () =>
          reservationItemsRepository.create({
            reservationId: reservation.id,
            eventSeatId: null,
            unitPriceCents: event.priceCents,
          }),
        ),
      );

      return { reservation, items };
    });
  }

  /**
   * Conta unidades GA que ainda ocupam capacidade dentro da transação que bloqueou o Event.
   *
   * Reservations confirmadas permanecem ocupando capacidade independentemente de `expiresAt`.
   * Holds não confirmados contam somente enquanto ativos, e cancelamentos deixam de ocupar estoque.
   *
   * @param manager - EntityManager da transação que mantém o lock do Event.
   * @param eventId - Event GENERAL_ADMISSION cuja ocupação será calculada.
   * @param now - Instante autoritativo usado para desconsiderar holds expirados.
   * @returns Quantidade de ReservationItems que atualmente consomem capacidade.
   */
  private countOccupiedGeneralAdmissionItems(
    manager: EntityManager,
    eventId: string,
    now: Date,
  ): Promise<number> {
    return manager
      .getRepository(ReservationItem)
      .createQueryBuilder('reservationItem')
      .innerJoin(
        Reservation,
        'reservation',
        '"reservation"."id" = "reservationItem"."reservationId"',
      )
      .where('"reservation"."eventId" = :eventId', { eventId })
      .andWhere('"reservation"."cancelledAt" IS NULL')
      .andWhere('("reservation"."confirmedAt" IS NOT NULL OR "reservation"."expiresAt" > :now)', {
        now,
      })
      .getCount();
  }

  /** Obtém o instante do PostgreSQL na mesma transação que protege a capacidade GA. */
  private async getDatabaseTimestamp(manager: EntityManager): Promise<Date> {
    const timestampRows = (await manager.query(
      'SELECT CURRENT_TIMESTAMP AS "now"',
    )) as DatabaseTimestampRow[];

    return new Date(timestampRows[0].now);
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
