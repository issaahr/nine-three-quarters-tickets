import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** Filtro opcional para abrir os Tickets de uma compra confirmada específica. */
export class ListTicketsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  public reservationId?: string;
}
