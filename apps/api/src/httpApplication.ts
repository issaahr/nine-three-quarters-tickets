import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { applicationConfig } from './config/applicationConfig';

// Aplica os contratos globais compartilhados por todos os endpoints HTTP.
export function configureHttpApplication(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.getHttpAdapter().getInstance().set('trust proxy', applicationConfig.proxy.trustedHops);
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
