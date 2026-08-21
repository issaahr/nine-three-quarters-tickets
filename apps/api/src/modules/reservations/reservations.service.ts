import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
import { ReservationItem } from './reservationItem.entity';
import { Reservation } from './reservation.entity';

interface DatabaseTimestampRow {
  now: Date;
}

@Injectable()
export class ReservationsService {
  public constructor(private readonly dataSource: DataSource) {}

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
      const timestampRows = (await manager.query(
        'SELECT CURRENT_TIMESTAMP AS "now"',
      )) as DatabaseTimestampRow[];
      const now = new Date(timestampRows[0].now);
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
}
