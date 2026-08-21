import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchMoviesQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Busca inválida' })
  @MinLength(2, { message: 'Busca deve possuir ao menos 2 caracteres' })
  @MaxLength(100, { message: 'Busca deve possuir no máximo 100 caracteres' })
  public query!: string;
}
