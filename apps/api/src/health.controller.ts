import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

import { ApplicationError } from './errors/application.error';

class DatabaseUnavailableError extends ApplicationError {
  public constructor(cause?: unknown) {
    super(
      'Serviço temporariamente indisponível',
      HttpStatus.SERVICE_UNAVAILABLE,
      'DATABASE_UNAVAILABLE',
      cause,
    );
  }
}

@ApiTags('Operacional')
@Controller('health')
export class HealthController {
  public constructor(private readonly dataSource: DataSource) {}

  @ApiOkResponse({ description: 'API e PostgreSQL disponíveis.' })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL indisponível.' })
  @Get()
  public async health(): Promise<{ ok: true }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (cause) {
      throw new DatabaseUnavailableError(cause);
    }

    return { ok: true };
  }
}
