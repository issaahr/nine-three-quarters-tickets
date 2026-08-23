import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';

import { Event } from '../event.entity';
import { EventStatus } from '../eventStatus.enum';
import { Reservation } from '../../reservations/reservation.entity';
import { ReservationItem } from '../../reservations/reservationItem.entity';
import { EventSeat } from '../eventSeat.entity';
import { Payment } from '../../payments/payment.entity';
import { PaymentStatus } from '../../payments/paymentStatus.enum';
import { Refund } from '../../refunds/refund.entity';
import { RefundStatus } from '../../refunds/refundStatus.enum';
import { Ticket } from '../../tickets/ticket.entity';
import { EventCannotBeCancelledError } from '../errors/eventCannotBeCancelled.error';
import { EventNotFoundError } from '../errors/eventNotFound.error';
import {
  EventDiscoveryFilters,
  EventDiscoveryPage,
  OrganizerEventWithStats,
  PublicEventDetail,
  EventCancellationResult,
} from './eventRepository.interfaces';

const eventDiscoveryPageSize = 12;

/**
 * Concentra consultas semânticas de Event que exigem QueryBuilder ou valores calculados pelo PostgreSQL.
 */
@Injectable()
export class EventRepository {
  public constructor(
    @InjectRepository(Event)
    private readonly repository: Repository<Event>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Atualiza o preço vigente sem alterar os snapshots já vinculados a Reservations e Tickets.
   *
   * @param organizerId - Identificador do organizador proprietário do Event.
   * @param eventId - Identificador do Event cujo preço será atualizado.
   * @param priceCents - Novo preço inteiro em centavos, já validado na borda HTTP.
   * @returns Event persistido com o novo preço vigente.
   */
  public updatePrice(organizerId: string, eventId: string, priceCents: number): Promise<Event> {
    return this.dataSource.transaction(async (manager) => {
      const eventsRepository = manager.getRepository(Event);
      const event = await eventsRepository.findOne({
        where: { id: eventId, organizerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!event || event.status === EventStatus.Cancelled) {
        throw new EventNotFoundError();
      }

      event.priceCents = priceCents;
      return eventsRepository.save(event);
    });
  }

  /**
   * Cancela a ocorrência e desfaz, no mesmo commit, holds, vendas e reembolsos relacionados.
   *
   * @param organizerId - Identificador do organizador que solicita o cancelamento.
   * @param eventId - Identificador do Event futuro a ser cancelado.
   * @returns Event cancelado e os EventSeats efetivamente liberados.
   */
  public cancel(organizerId: string, eventId: string): Promise<EventCancellationResult> {
    return this.dataSource.transaction(async (manager) => {
      const eventsRepository = manager.getRepository(Event);
      const reservationsRepository = manager.getRepository(Reservation);
      const reservationItemsRepository = manager.getRepository(ReservationItem);
      const paymentsRepository = manager.getRepository(Payment);
      const refundsRepository = manager.getRepository(Refund);
      const ticketsRepository = manager.getRepository(Ticket);
      const now = await this.getDatabaseTimestamp(manager);
      const event = await eventsRepository.findOne({
        where: { id: eventId, organizerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!event) throw new EventNotFoundError();
      if (event.status !== EventStatus.Published || event.startsAt.getTime() <= now.getTime())
        throw new EventCannotBeCancelledError();

      event.status = EventStatus.Cancelled;
      event.cancelledByUserId = organizerId;
      await eventsRepository.save(event);
      const reservations = await reservationsRepository.find({
        where: { eventId },
        lock: { mode: 'pessimistic_write' },
        order: { id: 'ASC' },
      });
      const releasedEventSeatIds: string[] = [];

      for (const reservation of reservations) {
        if (reservation.cancelledAt) continue;
        const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
        const eventSeatIds = items.flatMap((item) => (item.eventSeatId ? [item.eventSeatId] : []));
        if (!reservation.confirmedAt) {
          reservation.cancelledAt = now;
          await reservationsRepository.save(reservation);
          releasedEventSeatIds.push(...(await this.releaseHeldSeats(manager, reservation.id)));
          await paymentsRepository
            .createQueryBuilder()
            .update(Payment)
            .set({ status: PaymentStatus.Failed, failedAt: now })
            .where('"reservationId" = :reservationId', { reservationId: reservation.id })
            .andWhere('"status" = :status', { status: PaymentStatus.Pending })
            .execute();
          continue;
        }
        const payment = await paymentsRepository.findOne({
          where: { reservationId: reservation.id, status: PaymentStatus.Approved },
          lock: { mode: 'pessimistic_write' },
        });
        if (!payment) throw new EventCannotBeCancelledError();
        const itemIds = items.map((item) => item.id);
        await ticketsRepository.update({ reservationItemId: In(itemIds) }, { cancelledAt: now });
        releasedEventSeatIds.push(...(await this.releaseSoldSeats(manager, eventSeatIds)));
        reservation.cancelledAt = now;
        await reservationsRepository.save(reservation);
        if (payment.amountCents > 0) {
          await refundsRepository.save(
            refundsRepository.create({
              paymentId: payment.id,
              amountCents: payment.amountCents,
              status: RefundStatus.Completed,
              completedAt: now,
              failedAt: null,
            }),
          );
        }
      }
      return { event, releasedEventSeatIds };
    });
  }

  /**
   * Libera os holds que ainda pertencem à Reservation cancelada.
   *
   * @param manager - EntityManager vinculado à transação em curso.
   * @param reservationId - Identificador da Reservation proprietária dos holds.
   * @returns IDs dos assentos cuja disponibilidade foi restaurada.
   */
  private async releaseHeldSeats(manager: EntityManager, reservationId: string): Promise<string[]> {
    const result = await manager
      .getRepository(EventSeat)
      .createQueryBuilder()
      .update(EventSeat)
      .set({ holdReservationId: null, holdExpiresAt: null })
      .where('"holdReservationId" = :reservationId', { reservationId })
      .returning('"id"')
      .execute();
    return (result.raw as Array<{ id: string }>).map(({ id }) => id);
  }

  /**
   * Libera os assentos vendidos das compras reembolsadas pelo cancelamento do Event.
   *
   * @param manager - EntityManager vinculado à transação em curso.
   * @param eventSeatIds - Identificadores dos assentos associados às compras canceladas.
   * @returns IDs dos assentos cuja venda foi desfeita.
   */
  private async releaseSoldSeats(
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
      .returning('"id"')
      .execute();
    return (result.raw as Array<{ id: string }>).map(({ id }) => id);
  }

  /**
   * Obtém o instante autoritativo do PostgreSQL na mesma conexão transacional.
   *
   * @param manager - EntityManager vinculado à transação em curso.
   * @returns Instante corrente fornecido pelo PostgreSQL.
   */
  private async getDatabaseTimestamp(manager: EntityManager): Promise<Date> {
    const rows = (await manager.query('SELECT CURRENT_TIMESTAMP AS "now"')) as Array<{ now: Date }>;
    return new Date(rows[0].now);
  }

  /**
   * Descobre ocorrências públicas, ocultando as encerradas somente sem filtro de data explícito.
   *
   * @param filters - Busca, filtros e página já validados pela camada HTTP.
   * @returns Página determinística e indicação de continuidade.
   */
  public async discover(filters: EventDiscoveryFilters): Promise<EventDiscoveryPage> {
    const queryBuilder = this.repository
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.venue', 'venue')
      .where('"event"."status" = :publishedStatus', {
        publishedStatus: EventStatus.Published,
      });

    if (!filters.dateFrom && !filters.dateTo) {
      queryBuilder.andWhere('"event"."startsAt" > CURRENT_TIMESTAMP');
    }

    if (filters.query) {
      const searchPattern = `%${this.escapeLikePattern(filters.query)}%`;

      queryBuilder.andWhere(
        new Brackets((search) => {
          search
            .where('"event"."title" ILIKE :searchPattern', { searchPattern })
            .orWhere('COALESCE("event"."description", \'\') ILIKE :searchPattern');
        }),
      );
    }

    if (filters.category) {
      queryBuilder.andWhere('"event"."category" = :category', {
        category: filters.category,
      });
    }

    if (filters.genre) {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM unnest("event"."genres") AS "eventGenre" WHERE LOWER("eventGenre") = LOWER(:genre))',
        { genre: filters.genre },
      );
    }

    if (filters.city) {
      queryBuilder.andWhere('unaccent(LOWER("venue"."city")) = unaccent(LOWER(:city))', {
        city: filters.city,
      });
    }

    if (filters.dateFrom) {
      queryBuilder.andWhere(
        '("event"."startsAt" AT TIME ZONE "venue"."timeZone")::date >= CAST(:dateFrom AS date)',
        { dateFrom: filters.dateFrom },
      );
    }

    if (filters.dateTo) {
      queryBuilder.andWhere(
        '("event"."startsAt" AT TIME ZONE "venue"."timeZone")::date <= CAST(:dateTo AS date)',
        { dateTo: filters.dateTo },
      );
    }

    const offset = (filters.page - 1) * eventDiscoveryPageSize;
    const events = await queryBuilder
      .orderBy('event.startsAt', 'ASC')
      .addOrderBy('event.id', 'ASC')
      .skip(offset)
      .take(eventDiscoveryPageSize + 1)
      .getMany();
    const hasMore = events.length > eventDiscoveryPageSize;

    return {
      events: hasMore ? events.slice(0, eventDiscoveryPageSize) : events,
      page: filters.page,
      hasMore,
    };
  }

  /**
   * Carrega os Events do organizador com agregados de vendas calculados no PostgreSQL.
   *
   * @param organizerId - Identidade autenticada que delimita a propriedade dos Events.
   * @returns Ocorrências do organizador e métricas derivadas exclusivamente de Reservations confirmadas.
   */
  public async findForOrganizerWithStats(organizerId: string): Promise<OrganizerEventWithStats[]> {
    const result = await this.repository
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.venue', 'venue')
      .addSelect(
        '"event"."status" = :publishedStatus AND "event"."startsAt" > CURRENT_TIMESTAMP',
        'eventIsActive',
      )
      .addSelect(
        (subquery) =>
          subquery
            .select('COUNT("reservationItem"."id")')
            .from(ReservationItem, 'reservationItem')
            .innerJoin(
              Reservation,
              'reservation',
              '"reservation"."id" = "reservationItem"."reservationId"',
            )
            .where('"reservation"."eventId" = "event"."id"')
            .andWhere('"reservation"."confirmedAt" IS NOT NULL'),
        'eventSoldTickets',
      )
      .addSelect(
        (subquery) =>
          subquery
            .select('COUNT("reservationItem"."id")')
            .from(ReservationItem, 'reservationItem')
            .innerJoin(
              Reservation,
              'reservation',
              '"reservation"."id" = "reservationItem"."reservationId"',
            )
            .where('"reservation"."eventId" = "event"."id"')
            .andWhere('"reservation"."confirmedAt" IS NOT NULL')
            .andWhere('"reservation"."cancelledAt" IS NULL'),
        'eventOccupiedTickets',
      )
      .addSelect(
        (subquery) =>
          subquery
            .select('COALESCE(SUM("reservationItem"."unitPriceCents"), 0)')
            .from(ReservationItem, 'reservationItem')
            .innerJoin(
              Reservation,
              'reservation',
              '"reservation"."id" = "reservationItem"."reservationId"',
            )
            .where('"reservation"."eventId" = "event"."id"')
            .andWhere('"reservation"."confirmedAt" IS NOT NULL'),
        'eventRevenueCents',
      )
      .addSelect(
        (subquery) =>
          subquery
            .select('COALESCE(SUM("refund"."amountCents"), 0)')
            .from(Refund, 'refund')
            .innerJoin(Payment, 'payment', '"payment"."id" = "refund"."paymentId"')
            .innerJoin(Reservation, 'reservation', '"reservation"."id" = "payment"."reservationId"')
            .where('"reservation"."eventId" = "event"."id"')
            .andWhere('"refund"."status" = :completedRefundStatus'),
        'eventRefundedCents',
      )
      .addSelect(
        `CASE WHEN "event"."status" = :publishedStatus THEN
          CASE WHEN "event"."capacity" IS NULL THEN
            (SELECT COUNT("eventSeat"."id") FROM "eventSeats" "eventSeat" WHERE "eventSeat"."eventId" = "event"."id")
          ELSE "event"."capacity"
          END
        ELSE NULL END`,
        'eventInventoryTotal',
      )
      .where('"event"."organizerId" = :organizerId', { organizerId })
      .setParameter('publishedStatus', EventStatus.Published)
      .setParameter('completedRefundStatus', RefundStatus.Completed)
      .orderBy('event.startsAt', 'DESC')
      .getRawAndEntities();

    return result.entities.map((event, index) => {
      const raw = result.raw[index];

      return {
        event,
        isActive: raw.eventIsActive === true || raw.eventIsActive === 'true',
        soldTickets: Number(raw.eventSoldTickets),
        inventoryTotal: raw.eventInventoryTotal === null ? null : Number(raw.eventInventoryTotal),
        availableTickets:
          raw.eventInventoryTotal === null
            ? null
            : Number(raw.eventInventoryTotal) - Number(raw.eventOccupiedTickets),
        revenueCents: Number(raw.eventRevenueCents) - Number(raw.eventRefundedCents),
      };
    });
  }

  /**
   * Carrega uma ocorrência legível publicamente e calcula seu estado temporal no PostgreSQL.
   *
   * @param eventId - Identificador público da ocorrência.
   * @returns Event com Venue e estado temporal, ou null quando não estiver publicamente legível.
   */
  public async findPublicDetail(eventId: string): Promise<PublicEventDetail | null> {
    const result = await this.repository
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.venue', 'venue')
      .addSelect('"event"."startsAt" <= CURRENT_TIMESTAMP', 'eventIsPast')
      .where('"event"."id" = :eventId', { eventId })
      .andWhere('"event"."status" IN (:...publicStatuses)', {
        publicStatuses: [EventStatus.Published, EventStatus.Cancelled],
      })
      .getRawAndEntities();

    const event = result.entities[0];

    return event
      ? {
          event,
          isPast: result.raw[0]?.eventIsPast === true,
        }
      : null;
  }

  /**
   * Escapa curingas do `ILIKE` para que o texto informado seja pesquisado literalmente.
   *
   * @param value - Busca já normalizada pelo DTO.
   * @returns Padrão seguro para inclusão entre curingas controlados pela aplicação.
   */
  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
  }
}
