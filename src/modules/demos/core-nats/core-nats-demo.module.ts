import { Module } from '@nestjs/common';
import { NatsModule } from '@infrastructure/nats/nats.module';
import { CoreNatsDemoController } from './core-nats-demo.controller';
import { CoreNatsDemoService } from './core-nats-demo.service';

@Module({
  imports: [NatsModule],
  controllers: [CoreNatsDemoController],
  providers: [CoreNatsDemoService],
  exports: [CoreNatsDemoService],
})
export class CoreNatsDemoModule {}
