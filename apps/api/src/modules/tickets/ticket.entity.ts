import { Column, Entity, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { ReservationItem } from '../reservations/reservationItem.entity';

/**
 * Ingresso individual emitido para uma unidade confirmada de compra.
 */
@Entity('tickets')
@Unique('ticketsReservationItemUnique', ['reservationItemId'])
@Unique('ticketsPublicIdUnique', ['publicId'])
@Unique('ticketsManualCodeUnique', ['manualCode'])
export class Ticket extends BaseEntity {
  @Column({ type: 'uuid' })
  public reservationItemId!: string;

  @Column({ type: 'uuid' })
  public publicId!: string;

  @Column({ type: 'varchar', length: 9 })
  public manualCode!: string;

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
