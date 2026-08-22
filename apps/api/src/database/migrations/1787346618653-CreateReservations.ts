import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReservations1787346618653 implements MigrationInterface {
  public readonly name = 'CreateReservations1787346618653';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "customerId" uuid NOT NULL,
        "eventId" uuid NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "confirmedAt" timestamptz,
        "cancelledAt" timestamptz,
        CONSTRAINT "reservationsExpiresAfterCreation" CHECK ("expiresAt" > "createdAt"),
        CONSTRAINT "reservationsLifecycleConsistent" CHECK ("confirmedAt" IS NULL OR "cancelledAt" IS NULL),
        CONSTRAINT "reservationsPrimaryKey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "reservations"
      ADD CONSTRAINT "reservationsCustomerForeignKey"
      FOREIGN KEY ("customerId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "reservations"
      ADD CONSTRAINT "reservationsEventForeignKey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      'CREATE INDEX "reservationsCustomerEventExpiresAtIndex" ON "reservations" ("customerId", "eventId", "expiresAt")',
    );
    await queryRunner.query(`
      CREATE TABLE "reservationItems" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "reservationId" uuid NOT NULL,
        "eventSeatId" uuid,
        "unitPriceCents" integer NOT NULL,
        CONSTRAINT "reservationItemsUnitPriceCentsNonNegative" CHECK ("unitPriceCents" >= 0),
        CONSTRAINT "reservationItemsReservationEventSeatUnique" UNIQUE ("reservationId", "eventSeatId"),
        CONSTRAINT "reservationItemsPrimaryKey" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "reservationItems"
      ADD CONSTRAINT "reservationItemsReservationForeignKey"
      FOREIGN KEY ("reservationId") REFERENCES "reservations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "reservationItems"
      ADD CONSTRAINT "reservationItemsEventSeatForeignKey"
      FOREIGN KEY ("eventSeatId") REFERENCES "eventSeats"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(
      'CREATE INDEX "reservationItemsReservationIdIndex" ON "reservationItems" ("reservationId")',
    );
    await queryRunner.query(`
      ALTER TABLE "eventSeats"
      ADD CONSTRAINT "eventSeatsHoldReservationForeignKey"
      FOREIGN KEY ("holdReservationId") REFERENCES "reservations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "eventSeats" DROP CONSTRAINT "eventSeatsHoldReservationForeignKey"',
    );
    await queryRunner.query(
      'ALTER TABLE "reservationItems" DROP CONSTRAINT "reservationItemsEventSeatForeignKey"',
    );
    await queryRunner.query(
      'ALTER TABLE "reservationItems" DROP CONSTRAINT "reservationItemsReservationForeignKey"',
    );
    await queryRunner.query('DROP TABLE "reservationItems"');
    await queryRunner.query(
      'ALTER TABLE "reservations" DROP CONSTRAINT "reservationsEventForeignKey"',
    );
    await queryRunner.query(
      'ALTER TABLE "reservations" DROP CONSTRAINT "reservationsCustomerForeignKey"',
    );
    await queryRunner.query('DROP TABLE "reservations"');
  }
}
