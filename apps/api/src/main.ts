import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { resolve } from 'node:path';

import { AppModule } from './app.module';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

class Application {
  public async start(): Promise<void> {
    const port = Number(process.env.PORT);

    if (!port) {
      throw new Error('Variável de ambiente PORT não definida ou inválida');
    }

    const app = await NestFactory.create(AppModule);
    await app.listen(port);
  }
}

void new Application().start();
