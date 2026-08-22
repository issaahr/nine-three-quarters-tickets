import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketPresentationState1787371616648 implements MigrationInterface {
  name = 'AddTicketPresentationState1787371616648';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" ADD "checkedInAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "tickets" ADD "cancelledAt" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "cancelledAt"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "checkedInAt"`);
  }
}
