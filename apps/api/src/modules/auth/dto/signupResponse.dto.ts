import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '../../users/userRole.enum';

export class SignupResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ example: 'cliente@email.com', format: 'email' })
  public email!: string;

  @ApiProperty({ enum: [UserRole.Customer], example: UserRole.Customer })
  public role!: UserRole.Customer;
}
