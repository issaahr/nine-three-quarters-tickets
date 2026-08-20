import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitializeDatabase1787188878683 implements MigrationInterface {
  public readonly name = 'InitializeDatabase1787188878683';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
  }
}
