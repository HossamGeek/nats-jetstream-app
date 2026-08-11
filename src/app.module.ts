import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { NatsModule } from './infrastructure/nats/nats.module';

@Module({
  imports: [
    // Loads .env values once and makes ConfigService injectable application-wide.
    // NatsModule reads its connection settings from this global configuration.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // Provides the single reusable NATS infrastructure connection for the app.
    NatsModule,
    // Adds the minimal /health endpoint used to verify the NATS connection state.
    HealthModule,
  ],
  // Root controller/service are intentionally tiny; they only confirm the app is alive.
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
