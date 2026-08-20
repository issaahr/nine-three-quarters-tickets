import { Check, Column, Entity, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Venue } from './venue.entity';

/** Assento físico reutilizável que compõe o layout de um Venue. */
@Entity('venueSeats')
@Unique('venueSeatsVenueLabelUnique', ['venueId', 'label'])
@Unique('venueSeatsVenuePositionUnique', ['venueId', 'x', 'y'])
@Check('venueSeatsNumberPositive', '"number" > 0')
@Check('venueSeatsXNonNegative', '"x" >= 0')
@Check('venueSeatsYNonNegative', '"y" >= 0')
export class VenueSeat extends BaseEntity {
  @Column({ type: 'uuid' })
  public venueId!: string;

  @ManyToOne(() => Venue, (venue) => venue.seats, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venueId', foreignKeyConstraintName: 'venueSeatsVenueForeignKey' })
  public venue!: Relation<Venue>;

  @Column({ type: 'text' })
  public label!: string;

  @Column({ type: 'text' })
  public row!: string;

  @Column({ type: 'integer' })
  public number!: number;

  @Column({ type: 'integer' })
  public x!: number;

  @Column({ type: 'integer' })
  public y!: number;
}
