import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';

/** Alocação temporária de inventário pertencente a um CUSTOMER. */
@Entity('reservations')
@Index('reservationsCustomerEventExpiresAtIndex', ['customerId', 'eventId', 'expiresAt'])
@Check('reservationsExpiresAfterCreation', '"expiresAt" > "createdAt"')
@Check('reservationsLifecycleConsistent', '"confirmedAt" IS NULL OR "cancelledAt" IS NULL')
export class Reservation extends BaseEntity {
  @Column({ type: 'uuid' })
  public customerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'reservationsCustomerForeignKey' })
  public customer!: Relation<User>;

  @Column({ type: 'uuid' })
  public eventId!: string;

  @ManyToOne(() => Event, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'eventId', foreignKeyConstraintName: 'reservationsEventForeignKey' })
  public event!: Relation<Event>;

  @Column({ type: 'timestamptz' })
  public expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  public confirmedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  public cancelledAt!: Date | null;
}
