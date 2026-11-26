import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSimulatedPixPayments1795652983116 implements MigrationInterface {
  name = 'AddSimulatedPixPayments1795652983116';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ADD "simulationCompletionAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."paymentMethodEnum" RENAME TO "paymentMethodEnum_old"`,
    );
    await queryRunner.query(`CREATE TYPE "public"."paymentMethodEnum" AS ENUM('CARD', 'PIX')`);
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "method" TYPE "public"."paymentMethodEnum" USING "method"::"text"::"public"."paymentMethodEnum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."paymentMethodEnum_old"`);
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "paymentsSimulationCompletionMatchesMethod" CHECK (("method" = 'PIX') = ("simulationCompletionAt" IS NOT NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "paymentsSimulationCompletionMatchesMethod"`,
    );
    await queryRunner.query(`CREATE TYPE "public"."paymentMethodEnum_old" AS ENUM('CARD')`);
    // O cast impede o rollback do schema enquanto houver histórico de PIX.
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "method" TYPE "public"."paymentMethodEnum_old" USING "method"::"text"::"public"."paymentMethodEnum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."paymentMethodEnum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."paymentMethodEnum_old" RENAME TO "paymentMethodEnum"`,
    );
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "simulationCompletionAt"`);
  }
}
