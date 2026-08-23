import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, MoreThan } from 'typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { AdmissionMode } from '../events/admissionMode.enum';
import { Event } from '../events/event.entity';
import { EventStatus } from '../events/eventStatus.enum';
import { Payment } from '../payments/payment.entity';
import { PaymentStatus } from '../payments/paymentStatus.enum';
import { EventNotFoundError } from '../events/errors/eventNotFound.error';
import { SeatRealtimeGateway } from '../realtime/seatRealtime.gateway';
import { Refund } from '../refunds/refund.entity';
import { RefundStatus } from '../refunds/refundStatus.enum';
import { Ticket } from '../tickets/ticket.entity';
import { CreateReservationRequestDto } from './dto/createReservationRequest.dto';
import { CreateGeneralAdmissionReservationRequestDto } from './dto/createGeneralAdmissionReservationRequest.dto';
import { ActiveReservationExistsError } from './errors/activeReservationExists.error';
import { EventAlreadyStartedError } from './errors/eventAlreadyStarted.error';
import { EventCannotBeReservedError } from './errors/eventCannotBeReserved.error';
import { SeatUnavailableError } from './errors/seatUnavailable.error';
import { ReservationNotActiveError } from './errors/reservationNotActive.error';
import { ReservationNotFoundError } from './errors/reservationNotFound.error';
import { CancellationNotAllowedError } from './errors/cancellationNotAllowed.error';
import {
  CancellationTransactionResult,
  DatabaseTimestampRow,
  ReservationDetail,
} from './repositories/reservationRepository.interfaces';
import { ReservationRepository } from './repositories/reservation.repository';
import { ReservationItem } from './reservationItem.entity';
import { Reservation } from './reservation.entity';
import { ReservationStatus } from './reservationStatus.enum';

@Injectable()
export class ReservationsService {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly reservationRepository: ReservationRepository,
    private readonly seatRealtimeGateway: SeatRealtimeGateway,
  ) {}

  /**
   * Cria uma Reservation seated somente quando todos os EventSeats ainda podem ser adquiridos.
   *
   * A escrita condicional dos assentos e a criação dos itens compartilham a mesma transaction,
   * portanto qualquer conflito reverte a Reservation inteira.
   * O delta realtime é emitido somente depois que a transaction confirma o hold.
   *
   * @param customerId - Identidade CUSTOMER validada pelo cookie da sessão.
   * @param request - Event e EventSeats escolhidos apenas como intenção local de compra.
   * @returns Reservation e itens com o preço vigente fotografado no mesmo commit do hold.
   */
  public async create(
    customerId: string,
    request: CreateReservationRequestDto,
  ): Promise<{ reservation: Reservation; items: ReservationItem[] }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const eventsRepository = manager.getRepository(Event);
      const reservationsRepository = manager.getRepository(Reservation);
      const reservationItemsRepository = manager.getRepository(ReservationItem);
      const now = await this.getDatabaseTimestamp(manager);
      const expiresAt = new Date(
        now.getTime() + applicationConfig.reservations.holdDurationSeconds * 1000,
      );
      const event = await eventsRepository.findOne({
        where: { id: request.eventId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!event) {
        throw new EventNotFoundError();
      }

      if (event.status !== EventStatus.Published || event.admissionMode !== AdmissionMode.Seated) {
        throw new EventCannotBeReservedError();
      }

      if (event.startsAt.getTime() <= now.getTime()) {
        throw new EventAlreadyStartedError();
      }

      const activeReservation = await reservationsRepository.findOne({
        select: { id: true },
        where: {
          customerId,
          eventId: event.id,
          confirmedAt: IsNull(),
          cancelledAt: IsNull(),
          expiresAt: MoreThan(now),
        },
      });

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
      const acquiredSeatCount = await this.reservationRepository.acquireEventSeats(manager, {
        eventId: event.id,
        eventSeatIds: request.eventSeatIds,
        reservationId: reservation.id,
        expiresAt,
        now,
      });

      if (acquiredSeatCount !== request.eventSeatIds.length) {
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

    this.seatRealtimeGateway.emitHeld({
      eventId: result.reservation.eventId,
      eventSeatIds: [...request.eventSeatIds],
    });

    return result;
  }

  /**
   * Cria uma Reservation GA somente quando a quantidade integral cabe na capacidade agregada.
   *
   * O lock pessimista do Event serializa concorrentes antes da contagem autoritativa. Cada unidade
   * solicitada produz um ReservationItem sem EventSeat e com o preço vigente fotografado.
   *
   * @param customerId - Identidade CUSTOMER validada pelo cookie da sessão.
   * @param request - Event e quantidade escolhidos localmente, ainda sem constituir hold.
   * @returns Reservation e uma unidade persistida para cada ingresso adquirido.
   */
  public createGeneralAdmission(
    customerId: string,
    request: CreateGeneralAdmissionReservationRequestDto,
  ): Promise<{ reservation: Reservation; items: ReservationItem[] }> {
    return this.reservationRepository.createGeneralAdmission({
      customerId,
      eventId: request.eventId,
      quantity: request.quantity,
      holdDurationSeconds: applicationConfig.reservations.holdDurationSeconds,
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
   * Cancela uma Reservation ainda ativa e libera o inventário correspondente à sua modalidade.
   *
   * O bloqueio da Reservation serializa cancelamentos concorrentes e a condição no UPDATE impede que
   * um EventSeat reatribuído seja liberado por engano.
   * O delta realtime contém apenas os EventSeats efetivamente liberados e sai depois do commit.
   *
   * @param customerId - Identidade CUSTOMER validada pelo cookie da sessão.
   * @param reservationId - Identificador da Reservation que deve ser cancelada.
   * @returns Reservation cancelada com seus itens e estado derivado.
   */
  public async cancel(customerId: string, reservationId: string): Promise<ReservationDetail> {
    const result = await this.dataSource.transaction<CancellationTransactionResult>(
      async (manager) => {
        const eventsRepository = manager.getRepository(Event);
        const reservationsRepository = manager.getRepository(Reservation);
        const reservationItemsRepository = manager.getRepository(ReservationItem);
        const now = await this.getDatabaseTimestamp(manager);
        const reservationReference = await reservationsRepository.findOne({
          select: { id: true, eventId: true },
          where: { id: reservationId, customerId },
        });

        if (!reservationReference) {
          throw new ReservationNotFoundError();
        }

        const event = await eventsRepository.findOne({
          where: { id: reservationReference.eventId },
          lock: { mode: 'pessimistic_write' },
        });
        const reservation = await reservationsRepository.findOne({
          where: { id: reservationId, customerId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!event || !reservation) {
          throw new ReservationNotFoundError();
        }

        if (reservation.cancelledAt) {
          throw new ReservationNotActiveError();
        }

        if (!reservation.confirmedAt) {
          if (reservation.expiresAt.getTime() <= now.getTime()) {
            throw new ReservationNotActiveError();
          }

          reservation.cancelledAt = now;
          await reservationsRepository.save(reservation);
          const releasedEventSeatIds = await this.reservationRepository.releaseHeldEventSeats(
            manager,
            reservationId,
          );
          const items = await reservationItemsRepository.findBy({ reservationId });

          return {
            detail: { reservation, items, status: ReservationStatus.Cancelled },
            releasedEventSeatIds,
          };
        }

        const payment = await manager.getRepository(Payment).findOne({
          where: { reservationId, status: PaymentStatus.Approved },
          lock: { mode: 'pessimistic_write' },
        });
        const items = await reservationItemsRepository.findBy({ reservationId });
        const itemIds = items.map((item) => item.id);
        const ticketsRepository = manager.getRepository(Ticket);
        const tickets = await ticketsRepository.find({ where: { reservationItemId: In(itemIds) } });

        if (
          !event ||
          !payment ||
          event.startsAt.getTime() <= now.getTime() ||
          payment.approvedAt!.getTime() + 7 * 24 * 60 * 60 * 1000 <= now.getTime() ||
          tickets.some((ticket) => ticket.checkedInAt)
        ) {
          throw new CancellationNotAllowedError();
        }

        // Uma compra confirmada só pode ser cancelada antes do evento e dentro da janela de reembolso.
        const cancelledTicketCount = await this.reservationRepository.cancelTickets(
          manager,
          itemIds,
          now,
        );

        if (cancelledTicketCount !== tickets.length) {
          throw new CancellationNotAllowedError();
        }

        const eventSeatIds = items.flatMap((item) => (item.eventSeatId ? [item.eventSeatId] : []));
        const releasedEventSeatIds = await this.reservationRepository.releaseSoldEventSeats(
          manager,
          eventSeatIds,
        );

        if (releasedEventSeatIds.length !== eventSeatIds.length) {
          throw new CancellationNotAllowedError();
        }

        reservation.cancelledAt = now;
        await reservationsRepository.save(reservation);
        if (payment.amountCents > 0) {
          await manager.getRepository(Refund).save(
            manager.getRepository(Refund).create({
              paymentId: payment.id,
              amountCents: payment.amountCents,
              status: RefundStatus.Completed,
              completedAt: now,
              failedAt: null,
            }),
          );
        }

        return {
          detail: { reservation, items, status: ReservationStatus.Cancelled },
          releasedEventSeatIds,
        };
      },
    );

    if (result.releasedEventSeatIds.length > 0) {
      this.seatRealtimeGateway.emitReleased({
        eventId: result.detail.reservation.eventId,
        eventSeatIds: result.releasedEventSeatIds,
      });
    }

    return result.detail;
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
