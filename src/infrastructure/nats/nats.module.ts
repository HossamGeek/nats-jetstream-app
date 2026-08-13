import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import natsConfig from '@shared/config/nats.config';
import { NATS_OPTIONS } from '@shared/constants/nats.constants';
import type { NatsModuleOptions } from '@shared/interfaces/nats/nats-options.interface';
import { CoreNatsService } from './core/core-nats.service';
import { NatsService } from './nats.service';

@Module({
  imports: [
    ConfigModule.forFeature(natsConfig),
  ],
  providers: [
    {
      provide: NATS_OPTIONS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): NatsModuleOptions =>
        configService.getOrThrow<NatsModuleOptions>('nats'),
    },
    NatsService,
    CoreNatsService,
  ],
  exports: [NatsService, CoreNatsService],
})
export class NatsModule {}
