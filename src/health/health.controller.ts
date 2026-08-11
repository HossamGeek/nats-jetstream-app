import { Controller, Get } from '@nestjs/common';
import { NatsService } from '../infrastructure/nats/nats.service';
import type { HealthCheckResult, NatsHealthDetail } from '../shared/interfaces/health.interface';

@Controller('health')
export class HealthController {
  constructor(private readonly natsService: NatsService) {}

  @Get()
  check(): HealthCheckResult {
    // isConnected delegates to NatsConnection.isClosed(), so the endpoint does
    // not need to know any low-level NATS implementation details.
    const natsUp = this.natsService.isConnected;
    // Include the last startup/connection error when available to make local
    // troubleshooting clear without exposing credentials or server internals.
    const natsDetail: NatsHealthDetail = {
      status: natsUp ? 'up' : 'down',
      ...(this.natsService.lastError
        ? { message: this.natsService.lastError.message }
        : {}),
    };

    return {
      status: natsUp ? 'ok' : 'error',
      info: natsUp ? { nats: natsDetail } : {},
      error: natsUp ? {} : { nats: natsDetail },
      details: { nats: natsDetail },
    };
  }
}
