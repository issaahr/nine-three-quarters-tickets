import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVenueAdmissionMode1787474580093 implements MigrationInterface {
  public readonly name = 'AddVenueAdmissionMode1787474580093';

  /** Adiciona a modalidade explícita e migra com segurança os Venues já configurados. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "venues" ADD "admissionMode" "public"."admissionModeEnum"`,
    );
    await queryRunner.query(`
      UPDATE "venues" AS "venue"
      SET "admissionMode" = CASE
        WHEN EXISTS (
          SELECT 1 FROM "venueSeats" AS "seat" WHERE "seat"."venueId" = "venue"."id"
        ) THEN 'SEATED'::"public"."admissionModeEnum"
        ELSE 'GENERAL_ADMISSION'::"public"."admissionModeEnum"
      END
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "events" AS "event"
          INNER JOIN "venues" AS "venue" ON "venue"."id" = "event"."venueId"
          WHERE "event"."admissionMode" <> "venue"."admissionMode"
        ) THEN
          RAISE EXCEPTION 'Existem Events incompatíveis com a modalidade migrada de seus Venues';
        END IF;
      END
      $$
    `);
    await queryRunner.query(`ALTER TABLE "venues" ALTER COLUMN "admissionMode" SET NOT NULL`);
  }

  /** Remove somente a modalidade explícita adicionada por esta migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "admissionMode"`);
  }
}
