import { hash } from 'bcrypt';
import { MigrationInterface, QueryRunner } from 'typeorm';

const bcryptSaltRounds = 12;

const demoUsers = [
  {
    email: 'organizer.demo@ntq.local',
    role: 'ORGANIZER',
  },
  {
    email: 'customer.one.demo@ntq.local',
    role: 'CUSTOMER',
  },
  {
    email: 'customer.two.demo@ntq.local',
    role: 'CUSTOMER',
  },
  {
    email: 'gate.demo@ntq.local',
    role: 'GATE',
  },
] as const;

export class SeedDemoUsers1787189607374 implements MigrationInterface {
  public readonly name = 'SeedDemoUsers1787189607374';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const password = process.env.DEMO_USERS_PASSWORD;

    if (!password?.trim()) {
      throw new Error('Variável de ambiente obrigatória não definida: DEMO_USERS_PASSWORD');
    }

    const passwordHashes = await Promise.all(demoUsers.map(() => hash(password, bcryptSaltRounds)));

    for (const [index, demoUser] of demoUsers.entries()) {
      await queryRunner.query(
        `
          INSERT INTO "users" ("email", "passwordHash", "role")
          VALUES ($1, $2, $3)
        `,
        [demoUser.email, passwordHashes[index], demoUser.role],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM "users" WHERE "email" = ANY($1::varchar[])', [
      demoUsers.map(({ email }) => email),
    ]);
  }
}
