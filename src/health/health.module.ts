import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  // The module only declares the small health controller; it relies on the
  // globally exported NatsModule/NatsService instead of creating a new connection.
  controllers: [HealthController],
})
export class HealthModule {}
