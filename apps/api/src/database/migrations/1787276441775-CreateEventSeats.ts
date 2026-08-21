import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventSeats1787276441775 implements MigrationInterface {
  name = 'CreateEventSeats1787276441775';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "eventSeats" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "eventId" uuid NOT NULL, "venueSeatId" uuid NOT NULL, "holdReservationId" uuid, "holdExpiresAt" TIMESTAMP WITH TIME ZONE, "soldAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "eventSeatsEventVenueSeatUnique" UNIQUE ("eventId", "venueSeatId"), CONSTRAINT "eventSeatsSoldWithoutHold" CHECK ("soldAt" IS NULL OR ("holdReservationId" IS NULL AND "holdExpiresAt" IS NULL)), CONSTRAINT "eventSeatsHoldConsistent" CHECK (("holdReservationId" IS NULL AND "holdExpiresAt" IS NULL) OR
   ("holdReservationId" IS NOT NULL AND "holdExpiresAt" IS NOT NULL)), CONSTRAINT "PK_4e9d493ef9b45a71efbc9fc0e39" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `ALTER TABLE "eventSeats" ADD CONSTRAINT "eventSeatsEventForeignKey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventSeats" ADD CONSTRAINT "eventSeatsVenueSeatForeignKey" FOREIGN KEY ("venueSeatId") REFERENCES "venueSeats"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "eventSeats" DROP CONSTRAINT "eventSeatsVenueSeatForeignKey"`,
    );
    await queryRunner.query(`ALTER TABLE "eventSeats" DROP CONSTRAINT "eventSeatsEventForeignKey"`);
    await queryRunner.query(`DROP TABLE "eventSeats"`);
  }
}
