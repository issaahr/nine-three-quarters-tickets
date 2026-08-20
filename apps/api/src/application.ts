import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { applicationConfig } from './config/applicationConfig';

export class Application {
  // Aplica os contratos globais compartilhados por todos os endpoints HTTP.
  public configure(app: INestApplication): void {
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        stopAtFirstError: true,
        transform: true,
        whitelist: true,
      }),
    );
    app.enableCors({
      origin: applicationConfig.corsOrigins,
      credentials: true,
    });

    const swaggerConfig = new DocumentBuilder()
      .setTitle('9¾ Tickets API')
      .setDescription('API da plataforma 9¾ Tickets')
      .setVersion('1.0')
      .addCookieAuth(applicationConfig.auth.cookie.name)
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  public async start(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    this.configure(app);

    await app.listen(applicationConfig.port);
  }
}
