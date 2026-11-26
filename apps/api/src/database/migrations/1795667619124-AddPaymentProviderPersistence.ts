import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentProviderPersistence1795667619124 implements MigrationInterface {
  public readonly name = 'AddPaymentProviderPersistence1795667619124';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsSimulationCompletionMatchesMethod"`,
    );
    await queryRunner.query(`CREATE TYPE "public"."paymentProviderEnum" AS ENUM('FAKE', 'STRIPE')`);
    await queryRunner.query(`CREATE TYPE "public"."paymentCurrencyEnum" AS ENUM('BRL')`);
    // Os defaults preenchem o histórico, mas novas tentativas devem informar provedor e moeda.
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "provider" "public"."paymentProviderEnum" NOT NULL DEFAULT 'FAKE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "currency" "public"."paymentCurrencyEnum" NOT NULL DEFAULT 'BRL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "provider" DROP DEFAULT, ALTER COLUMN "currency" DROP DEFAULT`,
    );
    await queryRunner.query(`ALTER TABLE "payments" ADD "externalReference" text`);
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsExternalReferenceMatchesProvider" CHECK ("externalReference" IS NULL OR ("provider" <> 'FAKE' AND btrim("externalReference") <> ''))`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsSimulationCompletionMatchesProviderAndMethod" CHECK (("provider" = 'FAKE' AND "method" = 'PIX') = ("simulationCompletionAt" IS NOT NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsProviderExternalReferenceUnique" UNIQUE ("provider", "externalReference")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE "payments" IN ACCESS EXCLUSIVE MODE`);
    await queryRunner.query(`
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM "payments" WHERE "provider" <> 'FAKE') THEN
              RAISE EXCEPTION 'Rollback bloqueado: existe histórico de pagamentos de provedor externo';
            END IF;
          END;
          $$
        `);
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsProviderExternalReferenceUnique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsSimulationCompletionMatchesProviderAndMethod"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsExternalReferenceMatchesProvider"`,
    );
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "externalReference"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "currency"`);
    await queryRunner.query(`DROP TYPE "public"."paymentCurrencyEnum"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "provider"`);
    await queryRunner.query(`DROP TYPE "public"."paymentProviderEnum"`);
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsSimulationCompletionMatchesMethod" CHECK (("method" = 'PIX') = ("simulationCompletionAt" IS NOT NULL))`,
    );
  }
}
