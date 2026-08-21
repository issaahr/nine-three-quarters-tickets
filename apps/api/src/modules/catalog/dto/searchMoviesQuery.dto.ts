import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchMoviesQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Busca inválida' })
  @MinLength(2, { message: 'Busca deve possuir ao menos 2 caracteres' })
  @MaxLength(100, { message: 'Busca deve possuir no máximo 100 caracteres' })
  public query!: string;

  @Type(() => Number)
  @IsInt({ message: 'Página deve ser um inteiro' })
  @Min(1, { message: 'Página deve ser maior ou igual a 1' })
  @Max(500, { message: 'Página deve ser menor ou igual a 500' })
  public page = 1;
}
