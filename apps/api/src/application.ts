import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { applicationConfig } from './config/applicationConfig';
import { configureHttpApplication } from './httpApplication';

export class Application {
  // Aplica os contratos globais compartilhados por todos os endpoints HTTP.
  public configure(app: INestApplication): void {
    configureHttpApplication(app);
  }

  public async start(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    this.configure(app);

    await app.listen(applicationConfig.port);
  }
}
