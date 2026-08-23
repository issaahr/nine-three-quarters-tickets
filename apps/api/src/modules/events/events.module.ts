import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { Venue } from '../venues/venue.entity';
import { VenueSeat } from '../venues/venueSeat.entity';
import { Event } from './event.entity';
import { EventSeat } from './eventSeat.entity';
import { Reservation } from '../reservations/reservation.entity';
import { ReservationItem } from '../reservations/reservationItem.entity';
import { Payment } from '../payments/payment.entity';
import { Refund } from '../refunds/refund.entity';
import { Ticket } from '../tickets/ticket.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { GateEventsController } from './gateEvents.controller';
import { OrganizerEventsController } from './organizerEvents.controller';
import { EventSeatRepository } from './repositories/eventSeat.repository';
import { EventRepository } from './repositories/event.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      EventSeat,
      Venue,
      VenueSeat,
      Reservation,
      ReservationItem,
      Payment,
      Refund,
      Ticket,
    ]),
    AuthModule,
    CatalogModule,
    RealtimeModule,
  ],
  controllers: [EventsController, OrganizerEventsController, GateEventsController],
  providers: [EventsService, EventRepository, EventSeatRepository],
})
export class EventsModule {}
