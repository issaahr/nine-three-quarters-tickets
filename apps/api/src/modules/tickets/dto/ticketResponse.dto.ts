import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdmissionMode } from '../../events/admissionMode.enum';
import { EventCategory } from '../../events/eventCategory.enum';
import { TicketDetails, TicketEventDetails, TicketPurchase } from '../tickets.interfaces';
import { TicketStatus } from '../ticketStatus.enum';

export class TicketEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty()
  public title!: string;

  @ApiProperty({ enum: EventCategory, enumName: 'EventCategory' })
  public category!: EventCategory;

  @ApiProperty({ enum: AdmissionMode, enumName: 'AdmissionMode' })
  public admissionMode!: AdmissionMode;

  @ApiProperty({ type: String, format: 'date-time' })
  public startsAt!: Date;

  @ApiProperty()
  public venueName!: string;

  @ApiProperty()
  public venueCity!: string;

  @ApiProperty({ example: 'America/Fortaleza' })
  public venueTimeZone!: string;

  public static fromEvent(event: TicketEventDetails): TicketEventResponseDto {
    return event;
  }
}

export class TicketItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  public publicId!: string;

  @ApiProperty()
  public credential!: string;

  @ApiProperty({ example: '7K4P-M9Q2' })
  public manualCode!: string;

  @ApiProperty({ enum: TicketStatus, enumName: 'TicketStatus' })
  public status!: TicketStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  public issuedAt!: Date;

  @ApiPropertyOptional({ nullable: true, example: 'B12' })
  public seatLabel!: string | null;

  public static fromDetails(ticket: TicketDetails): TicketItemResponseDto {
    return {
      publicId: ticket.publicId,
      credential: ticket.credential,
      manualCode: ticket.manualCode,
      status: ticket.status,
      issuedAt: ticket.issuedAt,
      seatLabel: ticket.seatLabel,
    };
  }
}

export class TicketPurchaseResponseDto {
  @ApiProperty({ format: 'uuid' })
  public reservationId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public confirmedAt!: Date;

  @ApiProperty({ type: TicketEventResponseDto })
  public event!: TicketEventResponseDto;

  @ApiProperty({ type: TicketItemResponseDto, isArray: true })
  public tickets!: TicketItemResponseDto[];

  public static fromPurchase(purchase: TicketPurchase): TicketPurchaseResponseDto {
    return {
      reservationId: purchase.reservationId,
      confirmedAt: purchase.confirmedAt,
      event: TicketEventResponseDto.fromEvent(purchase.event),
      tickets: purchase.tickets.map(TicketItemResponseDto.fromDetails),
    };
  }
}

export class SharedTicketResponseDto extends TicketItemResponseDto {
  @ApiProperty({ type: TicketEventResponseDto })
  public event!: TicketEventResponseDto;

  public static fromDetails(ticket: TicketDetails): SharedTicketResponseDto {
    return {
      ...TicketItemResponseDto.fromDetails(ticket),
      event: TicketEventResponseDto.fromEvent(ticket.event),
    };
  }
}
