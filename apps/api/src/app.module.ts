import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { databaseConfig } from './config/databaseConfig';

@Module({
  imports: [TypeOrmModule.forRoot(databaseConfig)],
})
export class AppModule {}
