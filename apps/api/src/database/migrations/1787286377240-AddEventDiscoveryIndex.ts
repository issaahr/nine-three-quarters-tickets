import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventDiscoveryIndex1787286377240 implements MigrationInterface {
  name = 'AddEventDiscoveryIndex1787286377240';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "eventsDiscoveryStatusStartsAtIndex" ON "events" ("status", "startsAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."eventsDiscoveryStatusStartsAtIndex"`);
  }
}
