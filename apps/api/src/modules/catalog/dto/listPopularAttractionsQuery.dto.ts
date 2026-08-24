import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListPopularAttractionsQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'Página deve ser um inteiro' })
  @Min(1, { message: 'Página deve ser maior ou igual a 1' })
  @Max(100, { message: 'Página deve ser menor ou igual a 100' })
  public page = 1;
}
