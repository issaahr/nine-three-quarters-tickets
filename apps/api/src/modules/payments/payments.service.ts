import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { ReservationItem } from '../reservations/reservationItem.entity';
import { Reservation } from '../reservations/reservation.entity';
import { ReservationNotActiveError } from '../reservations/errors/reservationNotActive.error';
import { ReservationNotFoundError } from '../reservations/errors/reservationNotFound.error';
import { Payment } from './payment.entity';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentStatus } from './paymentStatus.enum';
import { CreateCardPaymentRequestDto } from './dto/createCardPaymentRequest.dto';
import { PaymentInProgressError } from './errors/paymentInProgress.error';
import { ReservationAlreadyPaidError } from './errors/reservationAlreadyPaid.error';
import { ReservationExpiredError } from './errors/reservationExpired.error';
import { PaymentRepository } from './repositories/payment.repository';

interface DatabaseTimestampRow {
  now: Date;
}

@Injectable()
export class PaymentsService {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly paymentRepository: PaymentRepository,
  ) {}

  /**
   * Persiste uma tentativa PENDING com exclusividade por Reservation antes do processamento externo.
   *
   * A Reservation é bloqueada antes de recuperar órfãos, resolver a idempotency key e criar
   * uma nova tentativa. A constraint parcial de Payment permanece como proteção estrutural
   * caso exista outro caminho concorrente de escrita no banco.
   *
   * @param customerId - Identidade do CUSTOMER autenticado que deve possuir a Reservation.
   * @param reservationId - Reservation que será paga.
   * @param idempotencyKey - UUID estável durante retries técnicos da mesma tentativa.
   * @param card - Dados transitórios validados, encaminhados ao gateway após o commit do PENDING.
   * @returns Payment existente para a mesma chave ou novo Payment PENDING persistido.
   */
  public async startCardPayment(
    customerId: string,
    reservationId: string,
    idempotencyKey: string,
    card: CreateCardPaymentRequestDto,
  ): Promise<Payment> {
    // O gateway recebe esses dados somente após o commit do PENDING, na próxima transação do fluxo.
    void card;

    return this.dataSource.transaction(async (manager) => {
      const reservationsRepository = manager.getRepository(Reservation);
      const reservationItemsRepository = manager.getRepository(ReservationItem);
      const now = await this.getDatabaseTimestamp(manager);
      const reservation = await reservationsRepository.findOne({
        where: { id: reservationId, customerId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) {
        throw new ReservationNotFoundError();
      }

      const staleBefore = new Date(
        now.getTime() - applicationConfig.payments.cardPendingTimeoutSeconds * 1000,
      );
      await this.paymentRepository.expireOrphanedPending(manager, reservation.id, staleBefore, now);

      const idempotentPayment = await this.paymentRepository.findByReservationAndIdempotencyKey(
        manager,
        reservation.id,
        idempotencyKey,
      );

      if (idempotentPayment) {
        return idempotentPayment;
      }

      const activePayment = await this.paymentRepository.findActiveByReservation(
        manager,
        reservation.id,
      );

      if (activePayment?.status === PaymentStatus.Pending) {
        throw new PaymentInProgressError();
      }

      if (activePayment?.status === PaymentStatus.Approved || reservation.confirmedAt) {
        throw new ReservationAlreadyPaidError();
      }

      if (reservation.cancelledAt) {
        throw new ReservationNotActiveError();
      }

      if (reservation.expiresAt.getTime() <= now.getTime()) {
        throw new ReservationExpiredError();
      }

      const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
      const amountCents = items.reduce((total, item) => total + item.unitPriceCents, 0);
      const paymentsRepository = manager.getRepository(Payment);

      return paymentsRepository.save(
        paymentsRepository.create({
          reservationId: reservation.id,
          method: PaymentMethod.Card,
          status: PaymentStatus.Pending,
          idempotencyKey,
          amountCents,
          approvedAt: null,
          failedAt: null,
        }),
      );
    });
  }

  /**
   * Obtém o instante autoritativo da conexão PostgreSQL da transação atual.
   *
   * @param manager - Manager vinculado à transação que utilizará o timestamp.
   * @returns Instante atual calculado pelo PostgreSQL.
   */
  private async getDatabaseTimestamp(manager: EntityManager): Promise<Date> {
    const timestampRows = (await manager.query(
      'SELECT CURRENT_TIMESTAMP AS "now"',
    )) as DatabaseTimestampRow[];

    return new Date(timestampRows[0].now);
  }
}
