import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateGeneralAdmissionReservationRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  public eventId!: string;

  @ApiProperty({ minimum: 1, example: 3 })
  @IsInt({ message: 'Quantidade deve ser informada como número inteiro' })
  @Min(1, { message: 'Quantidade deve ser maior ou igual a 1' })
  @Max(99_999, { message: 'Quantidade excede o limite permitido por requisição' })
  public quantity!: number;
}
