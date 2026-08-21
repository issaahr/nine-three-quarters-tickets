import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Venue } from './venue.entity';
import { VenuesController } from './venues.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Venue]), AuthModule],
  controllers: [VenuesController],
})
export class VenuesModule {}
