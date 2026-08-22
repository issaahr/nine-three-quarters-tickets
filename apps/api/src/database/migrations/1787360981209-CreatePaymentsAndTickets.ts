import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentsAndTickets1787360981209 implements MigrationInterface {
  name = 'CreatePaymentsAndTickets1787360981209';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tickets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reservationItemId" uuid NOT NULL, "issuedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "ticketsReservationItemUnique" UNIQUE ("reservationItemId"), CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."paymentMethodEnum" AS ENUM('CARD')`);
    await queryRunner.query(
      `CREATE TYPE "public"."paymentStatusEnum" AS ENUM('PENDING', 'APPROVED', 'DECLINED', 'FAILED')`,
    );
    await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reservationId" uuid NOT NULL, "method" "public"."paymentMethodEnum" NOT NULL, "status" "public"."paymentStatusEnum" NOT NULL, "idempotencyKey" uuid NOT NULL, "amountCents" integer NOT NULL, "approvedAt" TIMESTAMP WITH TIME ZONE, "failedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "paymentsReservationIdempotencyKeyUnique" UNIQUE ("reservationId", "idempotencyKey"), CONSTRAINT "paymentsLifecycleConsistent" CHECK (("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "failedAt" IS NULL) OR
   ("status" = 'FAILED' AND "approvedAt" IS NULL AND "failedAt" IS NOT NULL) OR
   ("status" IN ('PENDING', 'DECLINED') AND "approvedAt" IS NULL AND "failedAt" IS NULL)), CONSTRAINT "paymentsAmountCentsNonNegative" CHECK ("amountCents" >= 0), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "paymentsActiveReservationUnique" ON "payments" ("reservationId") WHERE "status" IN ('PENDING', 'APPROVED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD CONSTRAINT "ticketsReservationItemForeignKey" FOREIGN KEY ("reservationItemId") REFERENCES "reservationItems"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsReservationForeignKey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsReservationForeignKey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP CONSTRAINT "ticketsReservationItemForeignKey"`,
    );
    await queryRunner.query(`DROP INDEX "public"."paymentsActiveReservationUnique"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."paymentStatusEnum"`);
    await queryRunner.query(`DROP TYPE "public"."paymentMethodEnum"`);
    await queryRunner.query(`DROP TABLE "tickets"`);
  }
}
