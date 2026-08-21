import { ApiProperty } from '@nestjs/swagger';

import { ReservationItem } from '../reservationItem.entity';
import { Reservation } from '../reservation.entity';

export class ReservationItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public eventSeatId!: string;

  @ApiProperty({ minimum: 0 })
  public unitPriceCents!: number;

  /**
   * Converte o item persistido no contrato que preserva o snapshot de preço.
   */
  public static fromReservationItem(item: ReservationItem): ReservationItemResponseDto {
    return {
      id: item.id,
      eventSeatId: item.eventSeatId!,
      unitPriceCents: item.unitPriceCents,
    };
  }
}

export class CreateReservationResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public eventId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: Date;

  @ApiProperty({ type: ReservationItemResponseDto, isArray: true })
  public items!: ReservationItemResponseDto[];

  /**
   * Converte a Reservation recém-adquirida sem expor entidades de persistência pela API.
   */
  public static fromReservation(
    reservation: Reservation,
    items: ReservationItem[],
  ): CreateReservationResponseDto {
    return {
      id: reservation.id,
      eventId: reservation.eventId,
      expiresAt: reservation.expiresAt,
      items: items.map(ReservationItemResponseDto.fromReservationItem),
    };
  }
}
