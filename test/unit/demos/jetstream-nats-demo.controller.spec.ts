import { Test, TestingModule } from '@nestjs/testing';
import { JetStreamNatsDemoController } from '../../../src/modules/demos/jetstream-nats/jetstream-nats-demo.controller';
import { JetStreamNatsDemoService } from '../../../src/modules/demos/jetstream-nats/jetstream-nats-demo.service';

describe('JetStreamNatsDemoController', () => {
  let controller: JetStreamNatsDemoController;
  const demoService = {
    runStreamCrudDemo: jest.fn(),
    runHierarchicalSubjectsDemo: jest.fn(),
    runStorageDemo: jest.fn(),
    runLimitsDemo: jest.fn(),
    runMaxMessagesLimitDemo: jest.fn(),
    runMaxBytesLimitDemo: jest.fn(),
    runMaxAgeLimitDemo: jest.fn(),
    runWorkQueueAckDemo: jest.fn(),
    runInterestAckDemo: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const fn of Object.values(demoService)) {
      fn.mockResolvedValue({ scenario: 'ok', stream: 'DEMO_JS_TEST', evidence: {} });
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [JetStreamNatsDemoController],
      providers: [{ provide: JetStreamNatsDemoService, useValue: demoService }],
    }).compile();
    controller = moduleRef.get(JetStreamNatsDemoController);
  });

  it('returns the exact response contract for every endpoint', async () => {
    const expectedData = { scenario: 'ok', stream: 'DEMO_JS_TEST', evidence: {} };

    await expect(controller.streamCrud()).resolves.toEqual({ message: 'JetStream stream CRUD demo completed.', data: expectedData, status: 200 });
    await expect(controller.hierarchicalSubjects()).resolves.toEqual({ message: 'JetStream hierarchical-subjects demo completed.', data: expectedData, status: 200 });
    await expect(controller.storage()).resolves.toEqual({ message: 'JetStream File/Memory storage demo completed.', data: expectedData, status: 200 });
    await expect(controller.limits()).resolves.toEqual({ message: 'JetStream limits demo completed.', data: expectedData, status: 200 });
    await expect(controller.maxMessages()).resolves.toEqual({ message: 'JetStream max-msgs limit demo completed.', data: expectedData, status: 200 });
    await expect(controller.maxBytes()).resolves.toEqual({ message: 'JetStream max-bytes limit demo completed.', data: expectedData, status: 200 });
    await expect(controller.maxAge()).resolves.toEqual({ message: 'JetStream max-age limit demo completed.', data: expectedData, status: 200 });
    await expect(controller.workQueue()).resolves.toEqual({ message: 'JetStream WorkQueue ACK demo completed.', data: expectedData, status: 200 });
    await expect(controller.interest()).resolves.toEqual({ message: 'JetStream Interest two-consumer ACK demo completed.', data: expectedData, status: 200 });

    expect(demoService.runStreamCrudDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runHierarchicalSubjectsDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runStorageDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runLimitsDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runMaxMessagesLimitDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runMaxBytesLimitDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runMaxAgeLimitDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runWorkQueueAckDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runInterestAckDemo).toHaveBeenCalledTimes(1);
  });

  it('propagates service rejections unchanged', async () => {
    const failure = new Error('demo failed');
    demoService.runMaxBytesLimitDemo.mockRejectedValueOnce(failure);

    await expect(controller.maxBytes()).rejects.toBe(failure);
  });
});
