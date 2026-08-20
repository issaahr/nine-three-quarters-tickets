import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { getRequiredEnvironmentVariable } from './config/environment';

class Application {
  public async start(): Promise<void> {
    const port = Number(getRequiredEnvironmentVariable('PORT'));

    if (!port) {
      throw new Error('Variável de ambiente PORT não definida ou inválida');
    }

    const app = await NestFactory.create(AppModule);
    await app.listen(port);
  }
}

void new Application().start();
