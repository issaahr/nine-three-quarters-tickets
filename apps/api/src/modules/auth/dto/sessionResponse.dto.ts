import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '../../users/userRole.enum';

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  public role!: UserRole;
}
