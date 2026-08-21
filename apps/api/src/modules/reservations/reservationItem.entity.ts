import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { EventSeat } from '../events/eventSeat.entity';
import { Reservation } from './reservation.entity';

/** Unidade comercializada com preço imutável aplicado no instante da Reservation. */
@Entity('reservationItems')
@Index('reservationItemsReservationIdIndex', ['reservationId'])
@Unique('reservationItemsReservationEventSeatUnique', ['reservationId', 'eventSeatId'])
@Check('reservationItemsUnitPriceCentsNonNegative', '"unitPriceCents" >= 0')
export class ReservationItem extends BaseEntity {
  @Column({ type: 'uuid' })
  public reservationId!: string;

  @ManyToOne(() => Reservation, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reservationId',
    foreignKeyConstraintName: 'reservationItemsReservationForeignKey',
  })
  public reservation!: Relation<Reservation>;

  @Column({ type: 'uuid', nullable: true })
  public eventSeatId!: string | null;

  @ManyToOne(() => EventSeat, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'eventSeatId',
    foreignKeyConstraintName: 'reservationItemsEventSeatForeignKey',
  })
  public eventSeat!: Relation<EventSeat> | null;

  @Column({ type: 'integer' })
  public unitPriceCents!: number;
}
