import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateEventPriceRequestDto {
  @ApiProperty({ minimum: 0, example: 2500 })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  public priceCents!: number;
}
