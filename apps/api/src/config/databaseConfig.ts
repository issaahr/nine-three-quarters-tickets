import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';

import { loadDatabaseConnectionConfig } from './databaseConnectionConfig';

export const databaseConfig = {
  type: 'postgres',
  ...loadDatabaseConnectionConfig(process.env),
  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '../database/migrations/*{.ts,.js}')],
  migrationsRun: true,
  migrationsTableName: 'migrations',
  synchronize: false,
  uuidExtension: 'uuid-ossp',
} satisfies DataSourceOptions;
