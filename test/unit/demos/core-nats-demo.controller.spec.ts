import { Test, TestingModule } from '@nestjs/testing';
import { CoreNatsDemoController } from '../../../src/modules/demos/core-nats/core-nats-demo.controller';
import { CoreNatsDemoService } from '../../../src/modules/demos/core-nats/core-nats-demo.service';

describe('CoreNatsDemoController', () => {
  let controller: CoreNatsDemoController;
  const response = {
    demo: 'demo-name',
    status: 'started-and-finished' as const,
    observation: 'observation',
  };
  const demoService = {
    runExactSubjectDemo: jest.fn(() => Promise.resolve(undefined)),
    runStarWildcardDemo: jest.fn(() => Promise.resolve(undefined)),
    runGreaterThanWildcardDemo: jest.fn(() => Promise.resolve(undefined)),
    runFanOutDemo: jest.fn(() => Promise.resolve(undefined)),
    runQueueGroupJobDemo: jest.fn(() => Promise.resolve(undefined)),
    runQueueGroupBatchDemo: jest.fn(() => Promise.resolve(undefined)),
    runAtMostOnceDemo: jest.fn(() => Promise.resolve(undefined)),
    createResponse: jest.fn(() => response),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CoreNatsDemoController],
      providers: [{ provide: CoreNatsDemoService, useValue: demoService }],
    }).compile();

    controller = moduleRef.get(CoreNatsDemoController);
  });

  it('runs all demos and returns a service-created response', async () => {
    await expect(controller.runAll()).resolves.toBe(response);

    expect(demoService.runExactSubjectDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runStarWildcardDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runGreaterThanWildcardDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runFanOutDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runQueueGroupBatchDemo).toHaveBeenCalledWith(9);
    expect(demoService.runAtMostOnceDemo).toHaveBeenCalledTimes(1);
    expect(demoService.createResponse).toHaveBeenCalledWith('all', expect.any(String));
  });

  it('runs exact demo only', async () => {
    await expect(controller.runExact()).resolves.toBe(response);

    expect(demoService.runExactSubjectDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runStarWildcardDemo).not.toHaveBeenCalled();
    expect(demoService.createResponse).toHaveBeenCalledWith('exact', expect.any(String));
  });

  it('runs star wildcard demo only', async () => {
    await expect(controller.runStar()).resolves.toBe(response);

    expect(demoService.runStarWildcardDemo).toHaveBeenCalledTimes(1);
    expect(demoService.createResponse).toHaveBeenCalledWith('star', expect.any(String));
  });

  it('runs greater-than wildcard demo only', async () => {
    await expect(controller.runGreaterThan()).resolves.toBe(response);

    expect(demoService.runGreaterThanWildcardDemo).toHaveBeenCalledTimes(1);
    expect(demoService.createResponse).toHaveBeenCalledWith('greater-than', expect.any(String));
  });

  it('runs fan-out demo only', async () => {
    await expect(controller.runFanOut()).resolves.toBe(response);

    expect(demoService.runFanOutDemo).toHaveBeenCalledTimes(1);
    expect(demoService.createResponse).toHaveBeenCalledWith('fan-out', expect.any(String));
  });

  it('runs at-most-once demo only', async () => {
    await expect(controller.runAtMostOnce()).resolves.toBe(response);

    expect(demoService.runAtMostOnceDemo).toHaveBeenCalledTimes(1);
    expect(demoService.createResponse).toHaveBeenCalledWith('at-most-once', expect.any(String));
  });

  it('publishes one queue-group job', async () => {
    await expect(controller.publishQueueGroupJob()).resolves.toBe(response);

    expect(demoService.runQueueGroupJobDemo).toHaveBeenCalledWith({ jobId: 'job-100' });
    expect(demoService.createResponse).toHaveBeenCalledWith('queue-group-job', expect.any(String));
  });

  it('publishes a queue-group job batch', async () => {
    await expect(controller.publishQueueGroupBatch()).resolves.toBe(response);

    expect(demoService.runQueueGroupBatchDemo).toHaveBeenCalledWith(9);
    expect(demoService.createResponse).toHaveBeenCalledWith('queue-group-batch', expect.any(String));
  });
});
