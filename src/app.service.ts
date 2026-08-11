import { Injectable } from '@nestjs/common';
import type { RootInfoResponse } from './shared/interfaces/app.interface';

@Injectable()
export class AppService {
  getRootInfo(): RootInfoResponse {
    return {
      name: 'nats-jetstream-app',
      status: 'running',
    };
  }
}
