import { ValidationOptions, ValidateBy, buildMessage } from 'class-validator';

/**
 * Limita o tamanho UTF-8 real recebido pelo bcrypt, que considera somente
 * os primeiros 72 bytes e poderia tornar senhas visualmente distintas equivalentes.
 */
export function MaxUtf8ByteLength(maximumBytes: number, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'maxUtf8ByteLength',
      constraints: [maximumBytes],
      validator: {
        validate(value: unknown): boolean {
          return typeof value !== 'string' || Buffer.byteLength(value, 'utf8') <= maximumBytes;
        },
        defaultMessage: buildMessage(
          (prefix) => `${prefix}$property deve possuir no máximo $constraint1 bytes`,
          options,
        ),
      },
    },
    options,
  );
}
