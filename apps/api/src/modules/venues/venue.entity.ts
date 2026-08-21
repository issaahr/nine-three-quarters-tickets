import { Column, Entity, OneToMany, Relation } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { VenueSeat } from './venueSeat.entity';

/** Local físico pré-configurado que pode receber uma ocorrência. */
@Entity('venues')
export class Venue extends BaseEntity {
  @Column({ type: 'text' })
  public name!: string;

  @Column({ type: 'text' })
  public address!: string;

  @Column({ type: 'text' })
  public city!: string;

  @Column({ type: 'text' })
  public state!: string;

  @Column({ type: 'text' })
  public country!: string;

  @Column({ type: 'text' })
  public timeZone!: string;

  // Relations
  @OneToMany(() => VenueSeat, (seat) => seat.venue)
  public seats!: Relation<VenueSeat[]>;
}
