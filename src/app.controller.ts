import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { RootInfoResponse } from './shared/interfaces/app.interface';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRootInfo(): RootInfoResponse {
    return this.appService.getRootInfo();
  }
}
