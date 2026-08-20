import { Controller, Post } from '@nestjs/common';
import { ApiResponse } from '@shared/lib/responses/api-response';
import { JetStreamNatsDemoService } from './jetstream-nats-demo.service';

@Controller('jetstream-nats')
export class JetStreamNatsDemoController {
  constructor(private readonly demoService: JetStreamNatsDemoService) {}

  @Post('stream-crud')
  async streamCrud(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream stream CRUD demo completed.', await this.demoService.runStreamCrudDemo());
  }

  @Post('hierarchical-subjects')
  async hierarchicalSubjects(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream hierarchical-subjects demo completed.', await this.demoService.runHierarchicalSubjectsDemo());
  }

  @Post('storage')
  async storage(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream File/Memory storage demo completed.', await this.demoService.runStorageDemo());
  }

  @Post('limits')
  async limits(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream limits demo completed.', await this.demoService.runLimitsDemo());
  }

  @Post('limits/max-msgs')
  async maxMessages(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream max-msgs limit demo completed.', await this.demoService.runMaxMessagesLimitDemo());
  }

  @Post('limits/max-bytes')
  async maxBytes(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream max-bytes limit demo completed.', await this.demoService.runMaxBytesLimitDemo());
  }

  @Post('limits/max-age')
  async maxAge(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream max-age limit demo completed.', await this.demoService.runMaxAgeLimitDemo());
  }

  @Post('workqueue')
  async workQueue(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream WorkQueue ACK demo completed.', await this.demoService.runWorkQueueAckDemo());
  }

  @Post('interest')
  async interest(): Promise<ApiResponse> {
    return ApiResponse.successResponse('JetStream Interest two-consumer ACK demo completed.', await this.demoService.runInterestAckDemo());
  }
}
