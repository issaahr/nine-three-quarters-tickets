import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketCredentials1787369624392 implements MigrationInterface {
  name = 'AddTicketCredentials1787369624392';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" ADD "publicId" uuid`);
    await queryRunner.query(`ALTER TABLE "tickets" ADD "manualCode" character varying(9)`);
    await queryRunner.query(`
      DO $$
      DECLARE
        ticket_record RECORD;
        generated_public_id uuid;
        generated_manual_code text;
      BEGIN
        FOR ticket_record IN SELECT "id" FROM "tickets" WHERE "publicId" IS NULL LOOP
          LOOP
            generated_public_id := uuid_generate_v4();
            EXIT WHEN NOT EXISTS (
              SELECT 1 FROM "tickets" WHERE "publicId" = generated_public_id
            );
          END LOOP;

          LOOP
            generated_manual_code := upper(
              translate(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 8), '01', '23')
            );
            generated_manual_code :=
              substr(generated_manual_code, 1, 4) || '-' || substr(generated_manual_code, 5, 4);
            EXIT WHEN NOT EXISTS (
              SELECT 1 FROM "tickets" WHERE "manualCode" = generated_manual_code
            );
          END LOOP;

          UPDATE "tickets"
          SET "publicId" = generated_public_id, "manualCode" = generated_manual_code
          WHERE "id" = ticket_record."id";
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`ALTER TABLE "tickets" ALTER COLUMN "publicId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tickets" ALTER COLUMN "manualCode" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD CONSTRAINT "ticketsPublicIdUnique" UNIQUE ("publicId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD CONSTRAINT "ticketsManualCodeUnique" UNIQUE ("manualCode")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "ticketsManualCodeUnique"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "ticketsPublicIdUnique"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "manualCode"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "publicId"`);
  }
}
