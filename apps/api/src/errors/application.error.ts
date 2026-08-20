import { HttpException, HttpStatus } from '@nestjs/common';

// Padroniza o corpo e o status dos erros HTTP controlados pela aplicação.
export class ApplicationError extends HttpException {
  public constructor(
    message = 'Erro interno da aplicação',
    status = HttpStatus.INTERNAL_SERVER_ERROR,
    code = 'INTERNAL_SERVER_ERROR',
    cause?: unknown,
  ) {
    super({ statusCode: status, code, message }, status, { cause });
  }
}
