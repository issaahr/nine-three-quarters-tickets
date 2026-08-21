import { MigrationInterface, QueryRunner } from 'typeorm';

const initialVenueId = '93400000-0000-4000-8000-000000000001';
const rows = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const seatsPerRow = 10;

const initialVenueSeats = rows.flatMap((row, y) =>
  Array.from({ length: seatsPerRow }, (_, index) => {
    const number = index + 1;

    return {
      label: `${row}${number}`,
      row,
      number,
      // A coordenada ausente entre os blocos representa o corredor central.
      x: number <= 5 ? index : index + 1,
      y,
    };
  }),
);

export class SeedInitialVenueLayout1787270347626 implements MigrationInterface {
  public readonly name = 'SeedInitialVenueLayout1787270347626';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO "venues" ("id", "name", "address", "city", "state", "country", "timeZone")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        initialVenueId,
        'Cine Imperial · Sala A',
        'Rua das Lanternas, 93',
        'São Paulo',
        'São Paulo',
        'Brasil',
        'America/Sao_Paulo',
      ],
    );

    const parameters = initialVenueSeats.flatMap(({ label, row, number, x, y }) => [
      label,
      row,
      number,
      x,
      y,
    ]);
    const values = initialVenueSeats.map((_, index) => {
      const firstParameter = index * 5 + 2;
      const seatParameters = Array.from(
        { length: 5 },
        (__, offset) => `$${firstParameter + offset}`,
      ).join(', ');

      return `($1, ${seatParameters})`;
    });

    await queryRunner.query(
      `
        INSERT INTO "venueSeats" ("venueId", "label", "row", "number", "x", "y")
        VALUES ${values.join(', ')}
      `,
      [initialVenueId, ...parameters],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM "venueSeats" WHERE "venueId" = $1', [initialVenueId]);
    await queryRunner.query('DELETE FROM "venues" WHERE "id" = $1', [initialVenueId]);
  }
}
