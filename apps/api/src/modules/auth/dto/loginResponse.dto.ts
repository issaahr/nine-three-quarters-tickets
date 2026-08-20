import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '../../users/userRole.enum';

export class LoginResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ example: 'customer.one.demo@ntq.local', format: 'email' })
  public email!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  public role!: UserRole;
}
