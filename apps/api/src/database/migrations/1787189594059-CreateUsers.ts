import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1787189594059 implements MigrationInterface {
  public readonly name = 'CreateUsers1787189594059';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "userRoleEnum" AS ENUM ('ORGANIZER', 'CUSTOMER', 'GATE')`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "email" varchar(320) NOT NULL,
        "passwordHash" varchar(60) NOT NULL,
        "role" "userRoleEnum" NOT NULL,
        CONSTRAINT "usersEmailUnique" UNIQUE ("email"),
        CONSTRAINT "usersPrimaryKey" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "users"');
    await queryRunner.query('DROP TYPE "userRoleEnum"');
  }
}
