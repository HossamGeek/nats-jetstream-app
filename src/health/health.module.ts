import { Module } from '@nestjs/common';
import { NatsModule } from '@infrastructure/nats/nats.module';
import { HealthController } from './health.controller';

@Module({
  imports:[NatsModule],
  controllers: [HealthController],
})
export class HealthModule {}
