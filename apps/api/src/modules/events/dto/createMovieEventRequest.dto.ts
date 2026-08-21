import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Matches, Min } from 'class-validator';

export class CreateMovieEventRequestDto {
  @ApiProperty({ example: '693134' })
  @Matches(/^\d+$/, { message: 'Identificador externo do filme inválido' })
  public externalId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Venue inválido' })
  public venueId!: string;

  @ApiProperty({ example: '2026-09-01T20:30' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    message: 'Data e horário local devem usar o formato YYYY-MM-DDTHH:mm',
  })
  public startsAtLocal!: string;

  @ApiProperty({ example: 2500, minimum: 0 })
  @IsInt({ message: 'Preço deve ser informado em centavos inteiros' })
  @Min(0, { message: 'Preço não pode ser negativo' })
  public priceCents!: number;
}
