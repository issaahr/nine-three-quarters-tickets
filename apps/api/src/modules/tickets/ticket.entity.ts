import { Column, Entity, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { ReservationItem } from '../reservations/reservationItem.entity';

/**
 * Ingresso individual emitido para uma unidade confirmada de compra.
 */
@Entity('tickets')
@Unique('ticketsReservationItemUnique', ['reservationItemId'])
export class Ticket extends BaseEntity {
  @Column({ type: 'uuid' })
  public reservationItemId!: string;

  @Column({ type: 'timestamptz' })
  public issuedAt!: Date;

  // Relations
  @ManyToOne(() => ReservationItem, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reservationItemId',
    foreignKeyConstraintName: 'ticketsReservationItemForeignKey',
  })
  public reservationItem!: Relation<ReservationItem>;
}
