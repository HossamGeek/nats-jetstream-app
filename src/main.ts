import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Creates the Nest application and triggers module initialization, including
  // NatsService.onModuleInit(), before the HTTP server starts listening.
  //
  // TASK-01 bootstrap is HTTP-only: no microservice transports are registered.
  // Future microservices would be started via NestFactory.createMicroservice()
  // (or app.connectMicroservice() for a hybrid app) plus app.startAllMicroservices().
  const app = await NestFactory.create(AppModule);
  // Ensures NatsService.onModuleDestroy() closes the NATS connection on shutdown.
  app.enableShutdownHooks();

  // Read the HTTP port from the global configuration (loaded from .env) instead
  // of accessing process.env directly, keeping configuration access uniform.
  const configService = app.get(ConfigService);
  const port = parseInt(configService.get<string>('PORT') ?? '3000', 10);
  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}`, 'Bootstrap');
}

// Let Nest handle bootstrap errors through the rejected promise instead of
// blocking top-level execution with an extra wrapper.
void bootstrap();
