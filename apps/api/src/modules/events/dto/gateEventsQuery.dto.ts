import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class GateEventsQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Página deve ser um inteiro' })
  @Min(1, { message: 'Página deve ser maior ou igual a 1' })
  public page: number = 1;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean({ message: 'Filtro de hoje deve ser um booleano' })
  public today?: boolean;
}
