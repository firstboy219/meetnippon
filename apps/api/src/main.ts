import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

/**
 * Nest's default body parser (registered automatically by NestFactory.create)
 * caps requests at Express's built-in 100kb and rejects anything larger before
 * a route — or its DTO validation — ever runs. That is far below what a bulk
 * CSV import needs (a company-sized roster easily runs a few hundred KB as
 * JSON), so it is disabled here and re-registered with a limit matched to
 * nginx's client_max_body_size (20mb in both prod vhosts).
 */
const BODY_LIMIT = '15mb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, bodyParser: false });
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: true, // nginx fronts prod; tighten per-tenant in Phase 3/4
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = config.get<number>('API_PORT') ?? 8081;
  await app.listen(port, '0.0.0.0');
  Logger.log(`MeetNippon API listening on :${port}`, 'Bootstrap');
}

bootstrap();
