import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundsAndEventCancellationAudit1787448332672 implements MigrationInterface {
  name = 'AddRefundsAndEventCancellationAudit1787448332672';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservations" DROP CONSTRAINT "reservationsLifecycleConsistent"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."refundStatusEnum" AS ENUM('PENDING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(`CREATE TABLE "refunds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "paymentId" uuid NOT NULL, "amountCents" integer NOT NULL, "status" "public"."refundStatusEnum" NOT NULL, "completedAt" TIMESTAMP WITH TIME ZONE, "failedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "refundsLifecycleConsistent" CHECK (("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "failedAt" IS NULL) OR
   ("status" = 'FAILED' AND "completedAt" IS NULL AND "failedAt" IS NOT NULL) OR
   ("status" = 'PENDING' AND "completedAt" IS NULL AND "failedAt" IS NULL)), CONSTRAINT "refundsAmountCentsPositive" CHECK ("amountCents" > 0), CONSTRAINT "PK_5106efb01eeda7e49a78b869738" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "refundsActivePaymentUnique" ON "refunds" ("paymentId") WHERE "status" IN ('PENDING', 'COMPLETED')`,
    );
    await queryRunner.query(`ALTER TABLE "events" ADD "cancelledByUserId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "events" ADD CONSTRAINT "eventsCancelledByUserForeignKey" FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "refundsPaymentForeignKey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT "refundsPaymentForeignKey"`);
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "eventsCancelledByUserForeignKey"`,
    );
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "cancelledByUserId"`);
    await queryRunner.query(`DROP INDEX "public"."refundsActivePaymentUnique"`);
    await queryRunner.query(`DROP TABLE "refunds"`);
    await queryRunner.query(`DROP TYPE "public"."refundStatusEnum"`);
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD CONSTRAINT "reservationsLifecycleConsistent" CHECK ((("confirmedAt" IS NULL) OR ("cancelledAt" IS NULL)))`,
    );
  }
}
