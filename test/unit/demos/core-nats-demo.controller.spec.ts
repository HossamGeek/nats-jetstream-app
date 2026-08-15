import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CoreNatsDemoController } from '../../../src/modules/demos/core-nats/core-nats-demo.controller';
import { CoreNatsDemoService } from '../../../src/modules/demos/core-nats/core-nats-demo.service';

describe('CoreNatsDemoController', () => {
  let controller: CoreNatsDemoController;
  const demoService = {
    runExactSubjectDemo: jest.fn(() => Promise.resolve(undefined)),
    runStarWildcardDemo: jest.fn(() => Promise.resolve(undefined)),
    runGreaterThanWildcardDemo: jest.fn(() => Promise.resolve(undefined)),
    runFanOutDemo: jest.fn(() => Promise.resolve(undefined)),
    runQueueGroupJobDemo: jest.fn(() => Promise.resolve(undefined)),
    runQueueGroupBatchDemo: jest.fn(() => Promise.resolve(undefined)),
    runAtMostOnceDemo: jest.fn(() => Promise.resolve(undefined)),
    getUser: jest.fn(),
    triggerTimeout: jest.fn(),
    triggerNoResponder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CoreNatsDemoController],
      providers: [
        { provide: CoreNatsDemoService, useValue: demoService },
      ],
    }).compile();

    controller = moduleRef.get(CoreNatsDemoController);
  });

  it('runs all demos and returns an API response', async () => {
    await expect(controller.runAll()).resolves.toMatchObject({
      status: 200,
      data: { demo: 'all' },
    });

    expect(demoService.runExactSubjectDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runStarWildcardDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runGreaterThanWildcardDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runFanOutDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runQueueGroupBatchDemo).toHaveBeenCalledWith(9);
    expect(demoService.runAtMostOnceDemo).toHaveBeenCalledTimes(1);
  });

  it('runs exact demo only', async () => {
    await expect(controller.runExact()).resolves.toMatchObject({ data: { demo: 'exact' } });

    expect(demoService.runExactSubjectDemo).toHaveBeenCalledTimes(1);
    expect(demoService.runStarWildcardDemo).not.toHaveBeenCalled();
  });

  it('runs star wildcard demo only', async () => {
    await expect(controller.runStar()).resolves.toMatchObject({ data: { demo: 'star' } });

    expect(demoService.runStarWildcardDemo).toHaveBeenCalledTimes(1);
  });

  it('runs greater-than wildcard demo only', async () => {
    await expect(controller.runGreaterThan()).resolves.toMatchObject({ data: { demo: 'greater-than' } });

    expect(demoService.runGreaterThanWildcardDemo).toHaveBeenCalledTimes(1);
  });

  it('runs fan-out demo only', async () => {
    await expect(controller.runFanOut()).resolves.toMatchObject({ data: { demo: 'fan-out' } });

    expect(demoService.runFanOutDemo).toHaveBeenCalledTimes(1);
  });

  it('runs at-most-once demo only', async () => {
    await expect(controller.runAtMostOnce()).resolves.toMatchObject({ data: { demo: 'at-most-once' } });

    expect(demoService.runAtMostOnceDemo).toHaveBeenCalledTimes(1);
  });

  it('publishes one queue-group job', async () => {
    await expect(controller.publishQueueGroupJob()).resolves.toMatchObject({ data: { demo: 'queue-group-job' } });

    expect(demoService.runQueueGroupJobDemo).toHaveBeenCalledWith({ jobId: 'job-100' });
  });

  it('publishes a queue-group job batch', async () => {
    await expect(controller.publishQueueGroupBatch()).resolves.toMatchObject({ data: { demo: 'queue-group-batch' } });

    expect(demoService.runQueueGroupBatchDemo).toHaveBeenCalledWith(9);
  });

  it('fetches a user through the request/reply requester', async () => {
    demoService.getUser.mockResolvedValue({
      id: 'user-100',
      name: 'Demo User',
    });

    await expect(controller.getUser('user-100')).resolves.toEqual({
      id: 'user-100',
      name: 'Demo User',
    });
    expect(demoService.getUser).toHaveBeenCalledWith('user-100');
  });

  it('delegates timeout demo errors from the service', async () => {
    const exception = new HttpException({ error: 'TIMEOUT' }, 408);
    demoService.triggerTimeout.mockRejectedValue(exception);

    await expect(controller.requestReplyTimeout()).rejects.toBe(exception);
  });

  it('delegates no-responder demo errors from the service', async () => {
    const exception = new HttpException({ error: 'NO_RESPONDERS' }, 503);
    demoService.triggerNoResponder.mockRejectedValue(exception);

    await expect(controller.requestReplyNoResponder()).rejects.toBe(exception);
  });

  it('rethrows unexpected requester failures from the timeout endpoint', async () => {
    const unexpected = new Error('unexpected failure');
    demoService.triggerTimeout.mockRejectedValue(unexpected);

    await expect(controller.requestReplyTimeout()).rejects.toBe(unexpected);
  });
});
