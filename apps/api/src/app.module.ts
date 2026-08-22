import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { databaseConfig } from './config/databaseConfig';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { VenuesModule } from './modules/venues/venues.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    AuthModule,
    EventsModule,
    VenuesModule,
    ReservationsModule,
    PaymentsModule,
    TicketsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
