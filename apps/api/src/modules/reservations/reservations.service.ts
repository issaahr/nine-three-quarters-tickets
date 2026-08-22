import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { AdmissionMode } from '../events/admissionMode.enum';
import { Event } from '../events/event.entity';
import { EventSeat } from '../events/eventSeat.entity';
import { EventStatus } from '../events/eventStatus.enum';
import { EventNotFoundError } from '../events/errors/eventNotFound.error';
import { CreateReservationRequestDto } from './dto/createReservationRequest.dto';
import { ActiveReservationExistsError } from './errors/activeReservationExists.error';
import { EventAlreadyStartedError } from './errors/eventAlreadyStarted.error';
import { EventCannotBeReservedError } from './errors/eventCannotBeReserved.error';
import { SeatUnavailableError } from './errors/seatUnavailable.error';
import { ReservationNotActiveError } from './errors/reservationNotActive.error';
import { ReservationNotFoundError } from './errors/reservationNotFound.error';
import { ReservationDetail } from './repositories/reservationRepository.interfaces';
import { ReservationRepository } from './repositories/reservation.repository';
import { ReservationItem } from './reservationItem.entity';
import { Reservation } from './reservation.entity';
import { ReservationStatus } from './reservationStatus.enum';

interface DatabaseTimestampRow {
  now: Date;
}

@Injectable()
export class ReservationsService {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly reservationRepository: ReservationRepository,
  ) {}

  /**
   * Cria uma Reservation seated somente quando todos os EventSeats ainda podem ser adquiridos.
   *
   * A escrita condicional dos assentos e a criação dos itens compartilham a mesma transaction,
   * portanto qualquer conflito reverte a Reservation inteira.
   *
   * @param customerId - Identidade CUSTOMER validada pelo cookie da sessão.
   * @param request - Event e EventSeats escolhidos apenas como intenção local de compra.
   * @returns Reservation e itens com o preço vigente fotografado no mesmo commit do hold.
   */
  public async create(
    customerId: string,
    request: CreateReservationRequestDto,
  ): Promise<{ reservation: Reservation; items: ReservationItem[] }> {
    return this.dataSource.transaction(async (manager) => {
      const eventsRepository = manager.getRepository(Event);
      const eventSeatsRepository = manager.getRepository(EventSeat);
      const reservationsRepository = manager.getRepository(Reservation);
      const reservationItemsRepository = manager.getRepository(ReservationItem);
      const now = await this.getDatabaseTimestamp(manager);
      const expiresAt = new Date(
        now.getTime() + applicationConfig.reservations.holdDurationSeconds * 1000,
      );
      const event = await eventsRepository.findOneBy({ id: request.eventId });

      if (!event) {
        throw new EventNotFoundError();
      }

      if (event.status !== EventStatus.Published || event.admissionMode !== AdmissionMode.Seated) {
        throw new EventCannotBeReservedError();
      }

      if (event.startsAt.getTime() <= now.getTime()) {
        throw new EventAlreadyStartedError();
      }

      const activeReservation = await reservationsRepository
        .createQueryBuilder('reservation')
        .select('reservation.id')
        .where('"reservation"."customerId" = :customerId', { customerId })
        .andWhere('"reservation"."eventId" = :eventId', { eventId: event.id })
        .andWhere('"reservation"."confirmedAt" IS NULL')
        .andWhere('"reservation"."cancelledAt" IS NULL')
        .andWhere('"reservation"."expiresAt" > :now', { now })
        .getOne();

      if (activeReservation) {
        throw new ActiveReservationExistsError();
      }

      const reservation = await reservationsRepository.save(
        reservationsRepository.create({
          customerId,
          eventId: event.id,
          expiresAt,
          confirmedAt: null,
          cancelledAt: null,
        }),
      );
      const acquiredSeats = await eventSeatsRepository
        .createQueryBuilder()
        .update(EventSeat)
        .set({ holdReservationId: reservation.id, holdExpiresAt: expiresAt })
        .where('"id" IN (:...eventSeatIds)', { eventSeatIds: request.eventSeatIds })
        .andWhere('"eventId" = :eventId', { eventId: event.id })
        .andWhere('"soldAt" IS NULL')
        .andWhere('("holdReservationId" IS NULL OR "holdExpiresAt" <= :now)', { now })
        .execute();

      if (acquiredSeats.affected !== request.eventSeatIds.length) {
        throw new SeatUnavailableError();
      }

      const items = await reservationItemsRepository.save(
        request.eventSeatIds.map((eventSeatId) =>
          reservationItemsRepository.create({
            reservationId: reservation.id,
            eventSeatId,
            unitPriceCents: event.priceCents,
          }),
        ),
      );

      return { reservation, items };
    });
  }

  /**
   * Retorna uma Reservation pertencente ao CUSTOMER, com seu estado temporal calculado no PostgreSQL.
   *
   * @param customerId - Identidade CUSTOMER validada pelo cookie da sessão.
   * @param reservationId - Identificador da Reservation solicitada.
   * @returns Reservation detalhada pertencente ao CUSTOMER.
   */
  public async findOwned(customerId: string, reservationId: string): Promise<ReservationDetail> {
    const detail = await this.reservationRepository.findOwnedDetail(customerId, reservationId);

    if (!detail) {
      throw new ReservationNotFoundError();
    }

    return detail;
  }

  /**
   * Retorna a Reservation ativa do CUSTOMER para a ocorrência, quando ela ainda existir.
   *
   * @param customerId - Identidade CUSTOMER validada pelo cookie da sessão.
   * @param eventId - Identificador da ocorrência consultada.
   * @returns Reservation ativa detalhada ou null quando não existir uma.
   */
  public findActive(customerId: string, eventId: string): Promise<ReservationDetail | null> {
    return this.reservationRepository.findActiveByCustomerAndEvent(customerId, eventId);
  }

  /**
   * Cancela uma Reservation ainda ativa e libera exclusivamente os EventSeats que ela mantém em hold.
   *
   * O bloqueio da Reservation serializa cancelamentos concorrentes e a condição no UPDATE impede que
   * um EventSeat reatribuído seja liberado por engano.
   *
   * @param customerId - Identidade CUSTOMER validada pelo cookie da sessão.
   * @param reservationId - Identificador da Reservation que deve ser cancelada.
   * @returns Reservation cancelada com seus itens e estado derivado.
   */
  public async cancel(customerId: string, reservationId: string): Promise<ReservationDetail> {
    return this.dataSource.transaction(async (manager) => {
      const reservationsRepository = manager.getRepository(Reservation);
      const reservationItemsRepository = manager.getRepository(ReservationItem);
      const eventSeatsRepository = manager.getRepository(EventSeat);
      const now = await this.getDatabaseTimestamp(manager);
      const reservation = await reservationsRepository.findOne({
        where: { id: reservationId, customerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) {
        throw new ReservationNotFoundError();
      }

      if (
        reservation.confirmedAt ||
        reservation.cancelledAt ||
        reservation.expiresAt.getTime() <= now.getTime()
      ) {
        throw new ReservationNotActiveError();
      }

      reservation.cancelledAt = now;
      await reservationsRepository.save(reservation);
      await eventSeatsRepository
        .createQueryBuilder()
        .update(EventSeat)
        .set({ holdReservationId: null, holdExpiresAt: null })
        .where('"holdReservationId" = :reservationId', { reservationId })
        .execute();
      const items = await reservationItemsRepository.findBy({ reservationId });

      return { reservation, items, status: ReservationStatus.Cancelled };
    });
  }

  /**
   * Obtém o instante autoritativo da mesma conexão PostgreSQL que executará a transação.
   *
   * @param manager - EntityManager vinculado à transaction corrente.
   * @returns Instante atual fornecido pelo PostgreSQL.
   */
  private async getDatabaseTimestamp(manager: EntityManager): Promise<Date> {
    const timestampRows = (await manager.query(
      'SELECT CURRENT_TIMESTAMP AS "now"',
    )) as DatabaseTimestampRow[];

    return new Date(timestampRows[0].now);
  }
}
