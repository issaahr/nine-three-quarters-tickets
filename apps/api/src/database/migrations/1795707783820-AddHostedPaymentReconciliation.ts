import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHostedPaymentReconciliation1795707783820 implements MigrationInterface {
  public readonly name = 'AddHostedPaymentReconciliation1795707783820';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ADD "externalPaymentReference" text`);
    await queryRunner.query(
      `CREATE INDEX "paymentsPendingHostedReconciliationIndex" ON "payments" ("provider", "id") WHERE "status" = 'PENDING' AND "externalReference" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsExternalPaymentReferenceMatchesOutcome" CHECK ("externalPaymentReference" IS NULL OR ("provider" <> 'FAKE' AND "externalReference" IS NOT NULL AND btrim("externalPaymentReference") <> '' AND "status" IN ('APPROVED', 'FAILED')))`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsProviderExternalPaymentReferenceUnique" UNIQUE ("provider", "externalPaymentReference")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE "payments" IN ACCESS EXCLUSIVE MODE`);
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM "payments" WHERE "externalPaymentReference" IS NOT NULL) THEN
                    RAISE EXCEPTION 'Rollback bloqueado: existe histórico de cobranças externas conciliadas';
                END IF;
            END $$
        `);
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsProviderExternalPaymentReferenceUnique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsExternalPaymentReferenceMatchesOutcome"`,
    );
    await queryRunner.query(`DROP INDEX "public"."paymentsPendingHostedReconciliationIndex"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "externalPaymentReference"`);
  }
}
