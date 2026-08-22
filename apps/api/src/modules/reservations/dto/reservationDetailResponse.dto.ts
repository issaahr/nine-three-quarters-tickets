import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ReservationDetail } from '../repositories/reservationRepository.interfaces';
import { ReservationStatus } from '../reservationStatus.enum';
import { ReservationItemResponseDto } from './createReservationResponse.dto';

/**
 * Contrato de leitura da Reservation sem expor a entidade de persistência.
 */
export class ReservationDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ format: 'uuid' })
  public eventId!: string;

  @ApiProperty({ enum: ReservationStatus, enumName: 'ReservationStatus' })
  public status!: ReservationStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public confirmedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  public cancelledAt!: Date | null;

  @ApiProperty({ type: ReservationItemResponseDto, isArray: true })
  public items!: ReservationItemResponseDto[];

  /** Converte a leitura de domínio no contrato HTTP público da Reservation. */
  public static fromDetail(detail: ReservationDetail): ReservationDetailResponseDto {
    const { reservation } = detail;

    return {
      id: reservation.id,
      eventId: reservation.eventId,
      status: detail.status,
      expiresAt: reservation.expiresAt,
      confirmedAt: reservation.confirmedAt,
      cancelledAt: reservation.cancelledAt,
      items: detail.items.map(ReservationItemResponseDto.fromReservationItem),
    };
  }
}
