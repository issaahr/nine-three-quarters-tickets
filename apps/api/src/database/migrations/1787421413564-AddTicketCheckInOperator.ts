import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTicketCheckInOperator1787421413564 implements MigrationInterface {
  name = 'AddTicketCheckInOperator1787421413564';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" ADD "checkedInByUserId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD CONSTRAINT "ticketsCheckedInByUserForeignKey" FOREIGN KEY ("checkedInByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP CONSTRAINT "ticketsCheckedInByUserForeignKey"`,
    );
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "checkedInByUserId"`);
  }
}
