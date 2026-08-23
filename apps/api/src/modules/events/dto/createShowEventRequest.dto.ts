import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Matches, Max, Min } from 'class-validator';

export class CreateShowEventRequestDto {
  @ApiProperty({ example: 'K8vZ917Gku7' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Identificador externo da atração inválido' })
  public externalId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Venue inválido' })
  public venueId!: string;

  @ApiProperty({ example: '2026-09-01T20:30' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    message: 'Data e horário local devem usar o formato YYYY-MM-DDTHH:mm',
  })
  public startsAtLocal!: string;

  @ApiProperty({ example: 15000, minimum: 0 })
  @IsInt({ message: 'Preço deve ser informado em centavos inteiros' })
  @Min(0, { message: 'Preço não pode ser negativo' })
  @Max(100_000_000, { message: 'Preço excede o limite permitido' })
  public priceCents!: number;

  @ApiProperty({ example: 500, minimum: 1 })
  @IsInt({ message: 'Capacidade deve ser informada como número inteiro' })
  @Min(1, { message: 'Capacidade deve ser maior ou igual a 1' })
  @Max(2_147_483_647, { message: 'Capacidade excede o limite suportado' })
  public capacity!: number;
}
