import { Check, Column, Entity, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Reservation } from '../reservations/reservation.entity';
import { VenueSeat } from '../venues/venueSeat.entity';
import { Event } from './event.entity';

/**
 * Inventário materializado de um assento físico para uma ocorrência específica.
 */
@Entity('eventSeats')
@Unique('eventSeatsEventVenueSeatUnique', ['eventId', 'venueSeatId'])
@Check(
  'eventSeatsHoldConsistent',
  `("holdReservationId" IS NULL AND "holdExpiresAt" IS NULL) OR
   ("holdReservationId" IS NOT NULL AND "holdExpiresAt" IS NOT NULL)`,
)
@Check(
  'eventSeatsSoldWithoutHold',
  '"soldAt" IS NULL OR ("holdReservationId" IS NULL AND "holdExpiresAt" IS NULL)',
)
export class EventSeat extends BaseEntity {
  @Column({ type: 'uuid' })
  public eventId!: string;

  @Column({ type: 'uuid' })
  public venueSeatId!: string;

  @Column({ type: 'uuid', nullable: true })
  public holdReservationId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  public holdExpiresAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  public soldAt!: Date | null;

  // Relations
  @ManyToOne(() => Event, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'eventId', foreignKeyConstraintName: 'eventSeatsEventForeignKey' })
  public event!: Relation<Event>;

  @ManyToOne(() => VenueSeat, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venueSeatId', foreignKeyConstraintName: 'eventSeatsVenueSeatForeignKey' })
  public venueSeat!: Relation<VenueSeat>;

  @ManyToOne(() => Reservation, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'holdReservationId',
    foreignKeyConstraintName: 'eventSeatsHoldReservationForeignKey',
  })
  public holdReservation!: Relation<Reservation> | null;
}
