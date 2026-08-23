import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateGeneralAdmissionReservationRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  public eventId!: string;

  @ApiProperty({ minimum: 1, example: 3 })
  @IsInt({ message: 'Quantidade deve ser informada como número inteiro' })
  @Min(1, { message: 'Quantidade deve ser maior ou igual a 1' })
  public quantity!: number;
}
