import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Event } from '../events/event.entity';
import { EventSeat } from '../events/eventSeat.entity';
import { Payment } from '../payments/payment.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { Refund } from '../refunds/refund.entity';
import { Ticket } from '../tickets/ticket.entity';
import { ReservationItem } from './reservationItem.entity';
import { Reservation } from './reservation.entity';
import { ReservationRepository } from './repositories/reservation.repository';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      EventSeat,
      Reservation,
      ReservationItem,
      Payment,
      Refund,
      Ticket,
    ]),
    AuthModule,
    RealtimeModule,
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationRepository],
})
export class ReservationsModule {}
