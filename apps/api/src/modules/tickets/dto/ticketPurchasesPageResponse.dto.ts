import { ApiProperty } from '@nestjs/swagger';

import { TicketPurchase } from '../tickets.interfaces';
import { TicketPurchaseResponseDto } from './ticketResponse.dto';

export class TicketPurchasesPageResponseDto {
  @ApiProperty({ type: TicketPurchaseResponseDto, isArray: true })
  public items!: TicketPurchaseResponseDto[];

  @ApiProperty({ minimum: 1 })
  public page!: number;

  @ApiProperty()
  public hasMore!: boolean;

  public static fromPurchases(
    purchases: TicketPurchase[],
    page: number,
    hasMore: boolean,
  ): TicketPurchasesPageResponseDto {
    return {
      items: purchases.map(TicketPurchaseResponseDto.fromPurchase),
      page,
      hasMore,
    };
  }
}
