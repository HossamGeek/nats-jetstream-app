import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NatsModule } from '@infrastructure/nats/nats.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreNatsDemoModule } from './modules/demos/core-nats/core-nats-demo.module';
import { JetStreamNatsDemoModule } from './modules/demos/jetstream-nats/jetstream-nats-demo.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    NatsModule,
    CoreNatsDemoModule,
    JetStreamNatsDemoModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
