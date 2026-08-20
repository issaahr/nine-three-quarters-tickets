import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVenues1787269432210 implements MigrationInterface {
  public readonly name = 'CreateVenues1787269432210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "venues" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "name" text NOT NULL,
        "address" text NOT NULL,
        "city" text NOT NULL,
        "state" text NOT NULL,
        "country" text NOT NULL,
        "timeZone" text NOT NULL,
        CONSTRAINT "venuesPrimaryKey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "venueSeats" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "venueId" uuid NOT NULL,
        "label" text NOT NULL,
        "row" text NOT NULL,
        "number" integer NOT NULL,
        "x" integer NOT NULL,
        "y" integer NOT NULL,
        CONSTRAINT "venueSeatsVenuePositionUnique" UNIQUE ("venueId", "x", "y"),
        CONSTRAINT "venueSeatsVenueLabelUnique" UNIQUE ("venueId", "label"),
        CONSTRAINT "venueSeatsYNonNegative" CHECK ("y" >= 0),
        CONSTRAINT "venueSeatsXNonNegative" CHECK ("x" >= 0),
        CONSTRAINT "venueSeatsNumberPositive" CHECK ("number" > 0),
        CONSTRAINT "venueSeatsPrimaryKey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "venueSeats"
      ADD CONSTRAINT "venueSeatsVenueForeignKey"
      FOREIGN KEY ("venueId") REFERENCES "venues"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "venueSeats" DROP CONSTRAINT "venueSeatsVenueForeignKey"');
    await queryRunner.query('DROP TABLE "venueSeats"');
    await queryRunner.query('DROP TABLE "venues"');
  }
}
