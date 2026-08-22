import { Column, Entity, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { ReservationItem } from '../reservations/reservationItem.entity';
import { User } from '../users/user.entity';

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

  @Column({ type: 'timestamptz', nullable: true })
  public checkedInAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  public checkedInByUserId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  public cancelledAt!: Date | null;

  // Relations
  @ManyToOne(() => ReservationItem, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reservationItemId',
    foreignKeyConstraintName: 'ticketsReservationItemForeignKey',
  })
  public reservationItem!: Relation<ReservationItem>;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'checkedInByUserId',
    foreignKeyConstraintName: 'ticketsCheckedInByUserForeignKey',
  })
  public checkedInByUser!: Relation<User | null>;
}
