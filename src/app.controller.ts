import { Controller, Get } from '@nestjs/common';
import type { RootInfoResponse } from '@shared/interfaces/app.interface';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRootInfo(): RootInfoResponse {
    return this.appService.getRootInfo();
  }
}
