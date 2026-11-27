import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHostedRefundReconciliation1795709240758 implements MigrationInterface {
  public readonly name = 'AddHostedRefundReconciliation1795709240758';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD "externalStartedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "refunds" ADD "externalReference" text`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "refundsExternalReferenceUnique" ON "refunds" ("externalReference")`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "refundsExternalReferenceConsistent" CHECK ("externalReference" IS NULL OR ("externalStartedAt" IS NOT NULL AND btrim("externalReference") <> ''))`,
    );
    // Recupera cobranças tardias já conciliadas antes do processamento automático de estornos.
    await queryRunner.query(`
            INSERT INTO "refunds" ("paymentId", "amountCents", "status")
            SELECT payment."id", payment."amountCents", 'PENDING'
            FROM "payments" AS payment
            WHERE payment."status" = 'FAILED'
              AND payment."externalPaymentReference" IS NOT NULL
              AND payment."amountCents" > 0
              AND NOT EXISTS (
                SELECT 1 FROM "refunds" AS refund WHERE refund."paymentId" = payment."id"
              )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE "refunds" IN ACCESS EXCLUSIVE MODE`);
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM "refunds" WHERE "externalStartedAt" IS NOT NULL) THEN
                    RAISE EXCEPTION 'Rollback bloqueado: existe histórico de estornos externos iniciados';
                END IF;
            END $$
        `);
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT "refundsExternalReferenceConsistent"`,
    );
    await queryRunner.query(`DROP INDEX "public"."refundsExternalReferenceUnique"`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN "externalReference"`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN "externalStartedAt"`);
  }
}
