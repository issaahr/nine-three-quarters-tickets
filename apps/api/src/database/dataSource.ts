import { DataSource } from 'typeorm';

import { databaseConfig } from '../config/databaseConfig';

export default new DataSource(databaseConfig);
