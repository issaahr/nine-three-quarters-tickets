import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { databaseConfig } from './config/databaseConfig';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { VenuesModule } from './modules/venues/venues.module';

@Module({
  imports: [TypeOrmModule.forRoot(databaseConfig), AuthModule, EventsModule, VenuesModule],
})
export class AppModule {}
