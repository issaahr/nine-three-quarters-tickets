import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { Venue } from '../venues/venue.entity';
import { VenueSeat } from '../venues/venueSeat.entity';
import { Event } from './event.entity';
import { EventSeat } from './eventSeat.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { GateEventsController } from './gateEvents.controller';
import { OrganizerEventsController } from './organizerEvents.controller';
import { EventSeatRepository } from './repositories/eventSeat.repository';
import { EventRepository } from './repositories/event.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventSeat, Venue, VenueSeat]),
    AuthModule,
    CatalogModule,
  ],
  controllers: [EventsController, OrganizerEventsController, GateEventsController],
  providers: [EventsService, EventRepository, EventSeatRepository],
})
export class EventsModule {}
