import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';

import { getRequiredEnvironmentVariable } from './environment';

export const databaseConfig = {
  type: 'postgres',
  url: getRequiredEnvironmentVariable('DATABASE_URL'),
  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '../database/migrations/*{.ts,.js}')],
  migrationsRun: true,
  migrationsTableName: 'migrations',
  synchronize: false,
  uuidExtension: 'uuid-ossp',
} satisfies DataSourceOptions;
