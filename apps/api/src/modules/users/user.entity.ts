import { Column, Entity } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { UserRole } from './userRole.enum';

@Entity('users')
export class User extends BaseEntity {
  @Column({ length: 320, unique: true })
  public email!: string;

  @Column({ length: 60, select: false })
  public passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'userRoleEnum' })
  public role!: UserRole;
}
