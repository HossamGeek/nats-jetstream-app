import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { RootInfoResponse } from './shared/interfaces/app.interface';

@Controller()
export class AppController {
  // Dependency injection keeps the controller free of business/application logic.
  constructor(private readonly appService: AppService) {}

  @Get()
  // Lightweight root endpoint for a quick HTTP smoke check.
  getRootInfo(): RootInfoResponse {
    return this.appService.getRootInfo();
  }
}
