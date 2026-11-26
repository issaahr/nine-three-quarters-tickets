import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { Event } from '../events/event.entity';
import { EventStatus } from '../events/eventStatus.enum';
import { SeatRealtimeGateway } from '../realtime/seatRealtime.gateway';
import { Reservation } from '../reservations/reservation.entity';
import { ReservationItem } from '../reservations/reservationItem.entity';
import { TicketsService } from '../tickets/tickets.service';
import { PaymentNotFoundError } from './errors/paymentNotFound.error';
import { Payment } from './payment.entity';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentStatus } from './paymentStatus.enum';
import { DatabaseTimestampRow, PaymentFinalizationResult } from './payments.interfaces';
import { PaymentRepository } from './repositories/payment.repository';

@Injectable()
export class PaymentFinalizationService {
  private readonly logger = new Logger(PaymentFinalizationService.name);

  public constructor(
    private readonly dataSource: DataSource,
    private readonly paymentRepository: PaymentRepository,
    private readonly ticketsService: TicketsService,
    private readonly seatRealtimeGateway: SeatRealtimeGateway,
  ) {}

  /**
   * Aplica o resultado do gateway a uma tentativa de cartão. A confirmação da Reservation,
   * a consolidação do inventário e a emissão dos Tickets ocorrem na mesma transação.
   *
   * @param paymentId - Identificador da tentativa já persistida antes do processamento.
   * @param outcome - Resultado do processamento. Uma aprovação ainda depende da revalidação da compra.
   * @returns Payment em estado terminal. Se outra operação já o finalizou, retorna o estado persistido.
   */
  public async finalizePayment(
    paymentId: string,
    outcome: PaymentStatus.Approved | PaymentStatus.Declined,
  ): Promise<Payment> {
    return this.applyOutcome(paymentId, outcome);
  }

  /**
   * Revalida o vínculo com o CUSTOMER, o prazo do PIX e a validade da compra sob os locks
   * da confirmação. A espera pelo prazo mantém o Payment PENDING enquanto a compra é válida.
   *
   * @param customerId - Identidade do CUSTOMER autenticado e proprietário da Reservation.
   * @param reservationId - Reserva que deve conter a tentativa de PIX.
   * @param paymentId - Identificador da tentativa que o checkout está acompanhando.
   * @returns Payment pendente se ainda dentro da espera, terminal se finalizado nesta chamada ou antes.
   */
  public async settleSimulatedPixPayment(
    customerId: string,
    reservationId: string,
    paymentId: string,
  ): Promise<Payment> {
    return this.applyOutcome(paymentId, PaymentStatus.Approved, { customerId, reservationId });
  }

  /**
   * Usa o relógio do PostgreSQL após os locks para decidir se a compra pode ser confirmada.
   * Publica o delta de assentos vendidos somente após o commit.
   *
   * @param pixScope - Vincula o settlement de PIX ao CUSTOMER e à Reservation do checkout.
   * @returns Estado persistido da tentativa, que continua PENDING enquanto o PIX válido aguarda o prazo.
   */
  private async applyOutcome(
    paymentId: string,
    outcome: PaymentStatus.Approved | PaymentStatus.Declined,
    pixScope?: { customerId: string; reservationId: string },
  ): Promise<Payment> {
    try {
      const result = await this.dataSource.transaction<PaymentFinalizationResult>(
        async (manager) => {
          const paymentsRepository = manager.getRepository(Payment);
          const reservationsRepository = manager.getRepository(Reservation);
          const reservationItemsRepository = manager.getRepository(ReservationItem);
          const eventsRepository = manager.getRepository(Event);
          const paymentCriteria = pixScope
            ? { id: paymentId, method: PaymentMethod.Pix, reservationId: pixScope.reservationId }
            : { id: paymentId, method: PaymentMethod.Card };
          const paymentReference = await paymentsRepository.findOne({
            select: { reservationId: true },
            where: paymentCriteria,
          });
          if (!paymentReference) {
            throw new PaymentNotFoundError();
          }

          const reservationCriteria = pixScope
            ? { id: paymentReference.reservationId, customerId: pixScope.customerId }
            : { id: paymentReference.reservationId };
          const reservationReference = await reservationsRepository.findOne({
            select: { eventId: true },
            where: reservationCriteria,
          });
          if (!reservationReference) {
            throw new PaymentNotFoundError();
          }

          // A ordem Event → Reservation → Payment evita a inversão de locks com os cancelamentos.
          const event = await eventsRepository.findOneOrFail({
            where: { id: reservationReference.eventId },
            lock: { mode: 'pessimistic_write' },
          });
          const reservation = await reservationsRepository.findOne({
            where: reservationCriteria,
            lock: { mode: 'pessimistic_write' },
          });
          const payment = await paymentsRepository.findOne({
            where: paymentCriteria,
            lock: { mode: 'pessimistic_write' },
          });
          if (!reservation || !payment) {
            throw new PaymentNotFoundError();
          }

          if (payment.status !== PaymentStatus.Pending) {
            return { payment, eventId: null, soldEventSeatIds: [] };
          }

          if (outcome === PaymentStatus.Declined) {
            payment.status = PaymentStatus.Declined;
            return {
              payment: await paymentsRepository.save(payment),
              eventId: null,
              soldEventSeatIds: [],
            };
          }

          const now = await this.getDatabaseTimestamp(manager);
          if (
            reservation.confirmedAt ||
            reservation.cancelledAt ||
            reservation.expiresAt.getTime() <= now.getTime() ||
            event.status !== EventStatus.Published ||
            event.startsAt.getTime() <= now.getTime()
          ) {
            payment.status = PaymentStatus.Failed;
            payment.failedAt = now;
            this.logger.warn(`Payment ${payment.id} não pôde confirmar a Reservation`);
            return {
              payment: await paymentsRepository.save(payment),
              eventId: null,
              soldEventSeatIds: [],
            };
          }

          if (
            payment.method === PaymentMethod.Pix &&
            (!payment.simulationCompletionAt || payment.simulationCompletionAt > now)
          ) {
            return { payment, eventId: null, soldEventSeatIds: [] };
          }

          const items = await reservationItemsRepository.findBy({
            reservationId: reservation.id,
          });
          const seatedItemCount = items.filter((item) => item.eventSeatId !== null).length;
          const soldEventSeatIds = await this.paymentRepository.sellHeldEventSeats(
            manager,
            reservation.id,
            now,
          );

          if (soldEventSeatIds.length !== seatedItemCount) {
            // Reverte também os assentos já atualizados antes de registrar a falha em outra transação.
            throw new PaymentCompletionConflictError();
          }

          reservation.confirmedAt = now;
          payment.status = PaymentStatus.Approved;
          payment.approvedAt = now;
          await reservationsRepository.save(reservation);
          await this.ticketsService.issueForReservationItems(
            manager,
            items.map((item) => item.id),
            now,
          );

          return {
            payment: await paymentsRepository.save(payment),
            eventId: event.id,
            soldEventSeatIds,
          };
        },
      );

      if (result.eventId && result.soldEventSeatIds.length > 0) {
        this.seatRealtimeGateway.emitSold({
          eventId: result.eventId,
          eventSeatIds: result.soldEventSeatIds,
        });
      }

      return result.payment;
    } catch (error) {
      if (!(error instanceof PaymentCompletionConflictError)) {
        throw error;
      }

      this.logger.warn(`Pagamento ${paymentId} perdeu o hold antes da confirmação`);
      return this.failPayment(paymentId);
    }
  }

  /**
   * Registra a falha em uma transação própria. Em caso de perda de hold, ela ocorre após
   * o rollback da confirmação, para que nenhuma venda parcial seja persistida.
   *
   * @param paymentId - Identificador da tentativa que falhou no processamento ou na confirmação.
   * @returns Payment marcado como FAILED se ainda estava PENDING, ou o estado já persistido por outra operação.
   */
  public async failPayment(paymentId: string): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const paymentsRepository = manager.getRepository(Payment);
      const payment = await paymentsRepository.findOneOrFail({
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });

      if (payment.status !== PaymentStatus.Pending) {
        return payment;
      }

      payment.status = PaymentStatus.Failed;
      payment.failedAt = await this.getDatabaseTimestamp(manager);
      return paymentsRepository.save(payment);
    });
  }

  // CURRENT_TIMESTAMP não avança enquanto a transação aguarda os locks.
  private async getDatabaseTimestamp(manager: EntityManager): Promise<Date> {
    const timestampRows = (await manager.query(
      'SELECT clock_timestamp() AS "now"',
    )) as DatabaseTimestampRow[];

    return new Date(timestampRows[0].now);
  }
}

class PaymentCompletionConflictError extends Error {}
