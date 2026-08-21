import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { databaseConfig } from './config/databaseConfig';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [TypeOrmModule.forRoot(databaseConfig), AuthModule, EventsModule],
})
export class AppModule {}
