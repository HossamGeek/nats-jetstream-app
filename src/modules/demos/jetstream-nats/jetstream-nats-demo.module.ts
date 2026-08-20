import { Module } from '@nestjs/common';
import { NatsModule } from '@infrastructure/nats/nats.module';
import { JetStreamNatsDemoController } from './jetstream-nats-demo.controller';
import { JetStreamNatsDemoService } from './jetstream-nats-demo.service';

@Module({
  imports: [NatsModule],
  controllers: [JetStreamNatsDemoController],
  providers: [JetStreamNatsDemoService],
})
export class JetStreamNatsDemoModule {}
