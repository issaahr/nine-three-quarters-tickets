import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Event } from '../events/event.entity';
import { EventSeat } from '../events/eventSeat.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReservationItem } from './reservationItem.entity';
import { Reservation } from './reservation.entity';
import { ReservationRepository } from './repositories/reservation.repository';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventSeat, Reservation, ReservationItem]),
    AuthModule,
    RealtimeModule,
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationRepository],
})
export class ReservationsModule {}
