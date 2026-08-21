import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { Venue } from '../venues/venue.entity';
import { Event } from './event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, Venue]), AuthModule, CatalogModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
