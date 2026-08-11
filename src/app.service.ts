import { Injectable } from '@nestjs/common';
import type { RootInfoResponse } from './shared/interfaces/app.interface';

@Injectable()
export class AppService {
  // Static root response only identifies that the NestJS process is running.
  // NATS status is intentionally exposed separately by HealthController.
  getRootInfo(): RootInfoResponse {
    return {
      name: 'nats-jetstream-app',
      status: 'running',
    };
  }
}
