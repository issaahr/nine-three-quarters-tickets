import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetActiveReservationQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  public eventId!: string;
}
