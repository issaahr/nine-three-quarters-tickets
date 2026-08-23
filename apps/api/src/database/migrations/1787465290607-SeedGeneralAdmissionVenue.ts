import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedGeneralAdmissionVenue1787465290607 implements MigrationInterface {
  public readonly name = 'SeedGeneralAdmissionVenue1787465290607';

  /** Persiste o Venue sem assentos destinado aos Events GENERAL_ADMISSION. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO "venues" ("id", "name", "address", "city", "state", "country", "timeZone")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        '93400000-0000-4000-8000-000000000002',
        'Nexus Arena',
        'Rua dos Alfeneiros, 4',
        'Belém',
        'Pará',
        'Brasil',
        'America/Belem',
      ],
    );
  }

  /** Remove somente o Venue determinístico criado por esta migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM "venues" WHERE "id" = $1', [
      '93400000-0000-4000-8000-000000000002',
    ]);
  }
}
