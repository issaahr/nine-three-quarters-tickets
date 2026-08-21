import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvents1787271313878 implements MigrationInterface {
  public readonly name = 'CreateEvents1787271313878';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "eventCategoryEnum" AS ENUM ('MOVIE', 'SHOW')`);
    await queryRunner.query(
      `CREATE TYPE "admissionModeEnum" AS ENUM ('SEATED', 'GENERAL_ADMISSION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "eventStatusEnum" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED')`,
    );
    await queryRunner.query(`CREATE TYPE "catalogSourceEnum" AS ENUM ('TMDB', 'TICKETMASTER')`);
    await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "organizerId" uuid NOT NULL,
        "venueId" uuid NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "imageUrl" text,
        "category" "eventCategoryEnum" NOT NULL,
        "admissionMode" "admissionModeEnum" NOT NULL,
        "status" "eventStatusEnum" NOT NULL DEFAULT 'DRAFT',
        "startsAt" timestamptz NOT NULL,
        "priceCents" integer NOT NULL,
        "capacity" integer,
        "catalogSource" "catalogSourceEnum" NOT NULL,
        "externalId" text NOT NULL,
        "genres" text array NOT NULL DEFAULT '{}',
        CONSTRAINT "eventsPriceCentsNonNegative" CHECK ("priceCents" >= 0),
        CONSTRAINT "eventsCapacityValid" CHECK (
          ("admissionMode" = 'SEATED' AND "capacity" IS NULL) OR
          ("admissionMode" = 'GENERAL_ADMISSION' AND "capacity" IS NOT NULL AND "capacity" > 0)
        ),
        CONSTRAINT "eventsCategoryAdmissionModeValid" CHECK (
          ("category" = 'MOVIE' AND "admissionMode" = 'SEATED') OR
          ("category" = 'SHOW' AND "admissionMode" = 'GENERAL_ADMISSION')
        ),
        CONSTRAINT "eventsPrimaryKey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "events"
      ADD CONSTRAINT "eventsOrganizerForeignKey"
      FOREIGN KEY ("organizerId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "events"
      ADD CONSTRAINT "eventsVenueForeignKey"
      FOREIGN KEY ("venueId") REFERENCES "venues"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "events" DROP CONSTRAINT "eventsVenueForeignKey"');
    await queryRunner.query('ALTER TABLE "events" DROP CONSTRAINT "eventsOrganizerForeignKey"');
    await queryRunner.query('DROP TABLE "events"');
    await queryRunner.query('DROP TYPE "catalogSourceEnum"');
    await queryRunner.query('DROP TYPE "eventStatusEnum"');
    await queryRunner.query('DROP TYPE "admissionModeEnum"');
    await queryRunner.query('DROP TYPE "eventCategoryEnum"');
  }
}
