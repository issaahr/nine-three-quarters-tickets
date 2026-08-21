import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { CatalogSource } from '../catalog/catalogSource.enum';
import { User } from '../users/user.entity';
import { Venue } from '../venues/venue.entity';
import { AdmissionMode } from './admissionMode.enum';
import { EventCategory } from './eventCategory.enum';
import { EventStatus } from './eventStatus.enum';

/** Ocorrência local única que preserva o conteúdo externo necessário para sua apresentação. */
@Entity('events')
@Check(
  'eventsCategoryAdmissionModeValid',
  `("category" = '${EventCategory.Movie}' AND "admissionMode" = '${AdmissionMode.Seated}') OR
   ("category" = '${EventCategory.Show}' AND "admissionMode" = '${AdmissionMode.GeneralAdmission}')`,
)
@Check(
  'eventsCapacityValid',
  `("admissionMode" = '${AdmissionMode.Seated}' AND "capacity" IS NULL) OR
   ("admissionMode" = '${AdmissionMode.GeneralAdmission}' AND "capacity" IS NOT NULL AND "capacity" > 0)`,
)
@Check('eventsPriceCentsNonNegative', '"priceCents" >= 0')
@Index('eventsDiscoveryStatusStartsAtIndex', ['status', 'startsAt'])
export class Event extends BaseEntity {
  @Column({ type: 'uuid' })
  public organizerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organizerId', foreignKeyConstraintName: 'eventsOrganizerForeignKey' })
  public organizer!: Relation<User>;

  @Column({ type: 'uuid' })
  public venueId!: string;

  @ManyToOne(() => Venue, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venueId', foreignKeyConstraintName: 'eventsVenueForeignKey' })
  public venue!: Relation<Venue>;

  @Column({ type: 'text' })
  public title!: string;

  @Column({ type: 'text', nullable: true })
  public description!: string | null;

  @Column({ type: 'text', nullable: true })
  public imageUrl!: string | null;

  @Column({ type: 'enum', enum: EventCategory, enumName: 'eventCategoryEnum' })
  public category!: EventCategory;

  @Column({ type: 'enum', enum: AdmissionMode, enumName: 'admissionModeEnum' })
  public admissionMode!: AdmissionMode;

  @Column({
    type: 'enum',
    enum: EventStatus,
    enumName: 'eventStatusEnum',
    default: EventStatus.Draft,
  })
  public status!: EventStatus;

  @Column({ type: 'timestamptz' })
  public startsAt!: Date;

  @Column({ type: 'integer' })
  public priceCents!: number;

  @Column({ type: 'integer', nullable: true })
  public capacity!: number | null;

  @Column({ type: 'enum', enum: CatalogSource, enumName: 'catalogSourceEnum' })
  public catalogSource!: CatalogSource;

  @Column({ type: 'text' })
  public externalId!: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  public genres!: string[];
}
