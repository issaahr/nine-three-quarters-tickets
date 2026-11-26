import { Injectable } from '@nestjs/common';
import { Brackets, EntityManager, In, IsNull, UpdateResult } from 'typeorm';

import { EventSeat } from '../../events/eventSeat.entity';
import { Payment } from '../payment.entity';
import { PaymentMethod } from '../paymentMethod.enum';
import { PaymentProvider } from '../paymentProvider.enum';
import { SoldEventSeatRow } from '../payments.interfaces';
import { PaymentStatus } from '../paymentStatus.enum';

@Injectable()
export class PaymentRepository {
  /**
   * Limita a consulta às tentativas do titular da reserva, incluindo compras gratuitas locais.
   * Carrega a reserva e a ocorrência para verificar se o link ainda pode ser oferecido.
   *
   * @param manager - EntityManager da operação, vinculado à mesma transação quando ela estiver em curso.
   * @param customerId - Identidade autenticada do cliente que deve possuir a reserva.
   * @param reservationId - Identificador da reserva à qual a tentativa deve pertencer.
   * @param provider - Provedor da tentativa; a consulta também admite compras gratuitas locais.
   * @param paymentId - Quando omitido, prioriza a tentativa ativa e depois o resultado mais recente.
   * @returns Tentativa do titular com reserva e evento, ou null quando nenhuma tentativa corresponde aos critérios.
   */
  public findHostedForCheckout(
    manager: EntityManager,
    customerId: string,
    reservationId: string,
    provider: PaymentProvider,
    paymentId?: string,
  ): Promise<Payment | null> {
    const query = manager
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.reservation', 'reservation')
      .innerJoinAndSelect('reservation.event', 'event')
      .where('payment.reservationId = :reservationId AND reservation.customerId = :customerId', {
        reservationId,
        customerId,
      })
      .andWhere(
        new Brackets((providers) => {
          providers
            .where('payment.provider = :provider', { provider })
            .orWhere('payment.provider = :fake AND payment.amountCents = 0', {
              fake: PaymentProvider.Fake,
            });
        }),
      );
    if (paymentId) {
      return query.andWhere('payment.id = :paymentId', { paymentId }).getOne();
    }
    return query
      .orderBy('CASE WHEN payment.status IN (:...activeStatuses) THEN 0 ELSE 1 END', 'ASC')
      .setParameter('activeStatuses', [PaymentStatus.Pending, PaymentStatus.Approved])
      .addOrderBy('payment.createdAt', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .limit(1)
      .getOne();
  }

  /**
   * Grava a referência externa apenas se nenhuma chamada concorrente já tiver feito o vínculo.
   *
   * @param manager - EntityManager da operação, vinculado à mesma transação quando ela estiver em curso.
   * @param payment - Tentativa local gravada antes da chamada ao provedor.
   * @param externalReference - Identificador da sessão no provedor, validado contra a tentativa local.
   * @returns Resultado da atualização condicional. O chamador relê o vínculo vencedor antes de expor a URL.
   */
  public attachExternalReference(
    manager: EntityManager,
    payment: Payment,
    externalReference: string,
  ): Promise<UpdateResult> {
    return manager
      .getRepository(Payment)
      .update(
        { id: payment.id, provider: payment.provider, externalReference: IsNull() },
        { externalReference },
      );
  }

  /**
   * Recupera o PIX do checkout com verificação de propriedade na mesma consulta.
   * Prioriza a tentativa ativa e, quando ela não existe, retorna o resultado terminal mais recente.
   *
   * @param manager - Manager da leitura do estado persistido do checkout.
   * @param customerId - Identidade do CUSTOMER autenticado.
   * @param reservationId - Identificador da Reservation que deve pertencer ao CUSTOMER.
   * @returns Payment de PIX disponível para retomada ou null quando não há tentativa visível.
   */
  public findSimulatedPixForCheckout(
    manager: EntityManager,
    customerId: string,
    reservationId: string,
  ): Promise<Payment | null> {
    return manager
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .innerJoin('payment.reservation', 'reservation')
      .where({ reservationId, method: PaymentMethod.Pix, provider: PaymentProvider.Fake })
      .andWhere('reservation.customerId = :customerId', { customerId })
      .orderBy('CASE WHEN payment.status IN (:...activeStatuses) THEN 0 ELSE 1 END', 'ASC')
      .setParameter('activeStatuses', [PaymentStatus.Pending, PaymentStatus.Approved])
      .addOrderBy('payment.createdAt', 'DESC')
      .addOrderBy('payment.id', 'DESC')
      .limit(1)
      .getOne();
  }

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
   * Encerra tentativas de cartão fake que excederam a janela técnica de processamento.
   * O PIX aguarda o settlement mesmo após essa janela.
   *
   * @param manager - Manager vinculado à transação que bloqueou a Reservation.
   * @param reservationId - Reservation cujas tentativas podem ser recuperadas.
   * @param staleBefore - Limite temporal que identifica uma tentativa órfã.
   * @param now - Instante autoritativo do PostgreSQL usado como failedAt.
   * @returns Resultado da atualização condicional executada dentro da transação.
   */
  public expireOrphanedFakeCardPayments(
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
      .andWhere('"method" = :method', { method: PaymentMethod.Card })
      .andWhere('"provider" = :provider', { provider: PaymentProvider.Fake })
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
