import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class OrganizerEventsQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Página deve ser um inteiro' })
  @Min(1, { message: 'Página deve ser maior ou igual a 1' })
  public page: number = 1;
}
