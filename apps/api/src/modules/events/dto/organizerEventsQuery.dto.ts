import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { EventCategory } from '../eventCategory.enum';
import { EventStatus } from '../eventStatus.enum';

export class OrganizerEventsQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Página deve ser um inteiro' })
  @Min(1, { message: 'Página deve ser maior ou igual a 1' })
  public page: number = 1;

  @IsOptional()
  @IsString()
  public query?: string;

  @IsOptional()
  @IsEnum(EventCategory, { message: 'Categoria inválida' })
  public category?: EventCategory;

  @IsOptional()
  @IsEnum(EventStatus, { message: 'Status inválido' })
  public status?: EventStatus;

  @IsOptional()
  @IsDateString({}, { message: 'Data inicial inválida' })
  public dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Data final inválida' })
  public dateTo?: string;

  @IsOptional()
  @IsIn(['recent', 'oldest'], { message: 'Ordenação inválida' })
  public sort?: 'recent' | 'oldest' = 'recent';
}
