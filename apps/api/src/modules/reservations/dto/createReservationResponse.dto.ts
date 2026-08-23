import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ReservationItem } from '../reservationItem.entity';
import { Reservation } from '../reservation.entity';

export class ReservationItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  public eventSeatId!: string | null;

  @ApiProperty({ minimum: 0 })
  public unitPriceCents!: number;

  /**
   * Converte uma unidade comercializada, com assento somente quando a admissão é SEATED.
   *
   * @param item - ReservationItem persistido com seu snapshot de preço.
   * @returns Unidade HTTP comum a assentos e entradas gerais.
   */
  public static fromReservationItem(item: ReservationItem): ReservationItemResponseDto {
    return {
      id: item.id,
      eventSeatId: item.eventSeatId,
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
   *
   * @param reservation - Reservation persistida no mesmo commit do inventário.
   * @param items - Unidades comercializadas vinculadas à Reservation.
   * @returns Contrato de criação com expiração e snapshots unitários.
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
