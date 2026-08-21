import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { EventCategory } from '../eventCategory.enum';

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza filtros textuais opcionais antes da validação do DTO. */
function normalizeOptionalText({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim().replace(/\s+/g, ' ') || undefined;
}

export class DiscoverEventsQueryDto {
  @Transform(normalizeOptionalText)
  @IsOptional()
  @IsString({ message: 'Busca deve ser um texto' })
  @MinLength(1, { message: 'Busca não pode ser vazia' })
  @MaxLength(100, { message: 'Busca deve possuir no máximo 100 caracteres' })
  public query?: string;

  @IsOptional()
  @IsEnum(EventCategory, { message: 'Categoria inválida' })
  public category?: EventCategory;

  @Transform(normalizeOptionalText)
  @IsOptional()
  @IsString({ message: 'Gênero deve ser um texto' })
  @MinLength(1, { message: 'Gênero não pode ser vazio' })
  @MaxLength(100, { message: 'Gênero deve possuir no máximo 100 caracteres' })
  public genre?: string;

  @Transform(normalizeOptionalText)
  @IsOptional()
  @IsString({ message: 'Cidade deve ser um texto' })
  @MinLength(1, { message: 'Cidade não pode ser vazia' })
  @MaxLength(100, { message: 'Cidade deve possuir no máximo 100 caracteres' })
  public city?: string;

  @Transform(normalizeOptionalText)
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'Data inicial deve representar uma data válida no formato YYYY-MM-DD' },
  )
  @Matches(localDatePattern, { message: 'Data inicial deve usar o formato YYYY-MM-DD' })
  public dateFrom?: string;

  @Transform(normalizeOptionalText)
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'Data final deve representar uma data válida no formato YYYY-MM-DD' },
  )
  @Matches(localDatePattern, { message: 'Data final deve usar o formato YYYY-MM-DD' })
  public dateTo?: string;

  @Type(() => Number)
  @IsInt({ message: 'Página deve ser um inteiro' })
  @Min(1, { message: 'Página deve ser maior ou igual a 1' })
  @Max(100_000, { message: 'Página deve ser menor ou igual a 100000' })
  public page = 1;
}
