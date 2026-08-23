import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReservationRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  public eventId!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    uniqueItems: true,
    description: 'Identificadores EventSeat.id selecionados localmente pelo CUSTOMER.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(1_000, {
    message: 'Quantidade de assentos excede o limite permitido por requisição',
  })
  @IsUUID('4', { each: true })
  public eventSeatIds!: string[];
}
