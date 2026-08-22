import { Injectable } from '@nestjs/common';
import { EntityManager, In, UpdateResult } from 'typeorm';

import { EventSeat } from '../../events/eventSeat.entity';
import { Payment } from '../payment.entity';
import { SoldEventSeatRow } from '../payments.interfaces';
import { PaymentStatus } from '../paymentStatus.enum';

@Injectable()
export class PaymentRepository {
  /**
   * Converte em venda somente os EventSeats cujo hold válido ainda pertence à Reservation.
   *
   * @param manager - EntityManager vinculado à transaction de confirmação do pagamento.
   * @param reservationId - Reservation proprietária dos holds que serão convertidos em venda.
   * @param now - Instante autoritativo usado para validar o hold e registrar soldAt.
   * @returns Identificadores dos EventSeats efetivamente vendidos.
   */
  public async sellHeldEventSeats(
    manager: EntityManager,
    reservationId: string,
    now: Date,
  ): Promise<string[]> {
    const result = await manager
      .getRepository(EventSeat)
      .createQueryBuilder()
      .update(EventSeat)
      .set({ soldAt: now, holdReservationId: null, holdExpiresAt: null })
      .where('"holdReservationId" = :reservationId', { reservationId })
      .andWhere('"holdExpiresAt" > :now', { now })
      .andWhere('"soldAt" IS NULL')
      .returning('"id"')
      .execute();

    return (result.raw as SoldEventSeatRow[]).map(({ id }) => id);
  }

  /**
   * Finaliza tentativas PENDING cuja criação ultrapassou a janela técnica permitida.
   *
   * @param manager - Manager vinculado à transação que bloqueou a Reservation.
   * @param reservationId - Reservation cujas tentativas podem ser recuperadas.
   * @param staleBefore - Limite temporal que identifica uma tentativa órfã.
   * @param now - Instante autoritativo do PostgreSQL usado como failedAt.
   * @returns Resultado da atualização condicional executada dentro da transação.
   */
  public expireOrphanedPending(
    manager: EntityManager,
    reservationId: string,
    staleBefore: Date,
    now: Date,
  ): Promise<UpdateResult> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder()
      .update(Payment)
      .set({ status: PaymentStatus.Failed, failedAt: now })
      .where('"reservationId" = :reservationId', { reservationId })
      .andWhere('"status" = :status', { status: PaymentStatus.Pending })
      .andWhere('"createdAt" <= :staleBefore', { staleBefore })
      .execute();
  }

  /**
   * Busca a tentativa que representa exatamente a mesma intenção idempotente.
   *
   * @param manager - Manager vinculado à transação corrente.
   * @param reservationId - Reservation proprietária da tentativa.
   * @param idempotencyKey - Chave recebida para a tentativa atual ou retry técnico.
   * @returns Payment existente ou null quando a chave ainda não foi utilizada nessa Reservation.
   */
  public findByReservationAndIdempotencyKey(
    manager: EntityManager,
    reservationId: string,
    idempotencyKey: string,
  ): Promise<Payment | null> {
    return manager.getRepository(Payment).findOneBy({ reservationId, idempotencyKey });
  }

  /**
   * Localiza o único Payment que ainda bloqueia uma nova tentativa da Reservation.
   *
   * A constraint parcial do PostgreSQL protege a exclusividade; esta consulta determina
   * qual erro de domínio deve ser apresentado ao CUSTOMER.
   *
   * @param manager - Manager vinculado à transação corrente.
   * @param reservationId - Reservation que não pode possuir mais de um Payment ativo.
   * @returns Payment PENDING ou APPROVED, ou null quando uma nova tentativa pode ser criada.
   */
  public findActiveByReservation(
    manager: EntityManager,
    reservationId: string,
  ): Promise<Payment | null> {
    return manager
      .getRepository(Payment)
      .findOneBy({ reservationId, status: In([PaymentStatus.Pending, PaymentStatus.Approved]) });
  }
}
