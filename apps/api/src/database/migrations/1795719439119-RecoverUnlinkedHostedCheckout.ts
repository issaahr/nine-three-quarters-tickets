import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecoverUnlinkedHostedCheckout1795719439119 implements MigrationInterface {
  public readonly name = 'RecoverUnlinkedHostedCheckout1795719439119';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" ADD "checkoutReturnUrl" text`);
    await queryRunner.query(
      `CREATE INDEX "paymentsPendingUnlinkedReconciliationIndex" ON "payments" ("provider", "id") WHERE "status" = 'PENDING' AND "externalReference" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsCheckoutReturnUrlMatchesProvider" CHECK ("checkoutReturnUrl" IS NULL OR ("provider" <> 'FAKE' AND btrim("checkoutReturnUrl") <> ''))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Uma versão anterior repetiria a criação com a configuração atual em vez da URL preservada.
    await queryRunner.query(`LOCK TABLE "payments" IN ACCESS EXCLUSIVE MODE`);
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM "payments"
                    WHERE "status" = 'PENDING'
                      AND "externalReference" IS NULL
                      AND "checkoutReturnUrl" IS NOT NULL
                ) THEN
                    RAISE EXCEPTION 'Rollback bloqueado: existem tentativas hospedadas sem vínculo externo';
                END IF;
            END $$
        `);
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsCheckoutReturnUrlMatchesProvider"`,
    );
    await queryRunner.query(`DROP INDEX "public"."paymentsPendingUnlinkedReconciliationIndex"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "checkoutReturnUrl"`);
  }
}
