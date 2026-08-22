import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnaccentForEventDiscovery1787355171074 implements MigrationInterface {
  public readonly name = 'AddUnaccentForEventDiscovery1787355171074';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS unaccent');
  }
}
