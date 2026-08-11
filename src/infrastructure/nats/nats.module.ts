import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import natsConfig from '../../shared/config/nats.config';
import { NATS_OPTIONS } from '../../shared/constants/nats.constants';
import type { NatsModuleOptions } from '../../shared/interfaces/nats-options.interface';
import { NatsService } from './nats.service';

/**
 * Global NATS infrastructure module. Exposes `NatsService` (and thereby the raw
 * `NatsConnection`) to every module in the application.
 */
@Global()
@Module({
  imports: [
    // Registers the `nats` configuration namespace. All environment parsing and
    // defaulting happens in nats.config.ts instead of being built inline here.
    ConfigModule.forFeature(natsConfig),
  ],
  providers: [
    {
      // Thin bridge between the shared config namespace and the service's options
      // token; it contains no configuration logic of its own.
      provide: NATS_OPTIONS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): NatsModuleOptions =>
        configService.getOrThrow<NatsModuleOptions>('nats'),
    },
    // Singleton provider owned by this module; consumers should inject this instead
    // of calling connect() themselves.
    NatsService,
  ],
  // Exporting the service lets other modules reuse the same connection instance.
  exports: [NatsService],
})
export class NatsModule {}
