import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NoRespondersError, RequestError, TimeoutError } from '@nats-io/transport-node';
import { CoreNatsService } from '@infrastructure/nats/core/core-nats.service';
import type { CoreNatsMessageHandler } from '@shared/interfaces/nats/core-nats.types';
import { CoreNatsDemoService } from '../../../src/modules/demos/core-nats/core-nats-demo.service';

describe('CoreNatsDemoService', () => {
  let service: CoreNatsDemoService;
  let loggerLogSpy: jest.SpyInstance;
  const subscriptions = [
    { unsubscribe: jest.fn(), closed: Promise.resolve(undefined) },
    { unsubscribe: jest.fn(), closed: Promise.resolve(undefined) },
    { unsubscribe: jest.fn(), closed: Promise.resolve(undefined) },
    { unsubscribe: jest.fn(), closed: Promise.resolve(undefined) },
    { unsubscribe: jest.fn(), closed: Promise.resolve(undefined) },
    { unsubscribe: jest.fn(), closed: Promise.resolve(undefined) },
  ];
  const handlers: Array<CoreNatsMessageHandler<unknown>> = [];
  const coreNatsService = {
    subscribe: jest.fn((_: string, handler: CoreNatsMessageHandler<unknown>) => {
      handlers.push(handler);
      return subscriptions[handlers.length - 1] ?? subscriptions[0];
    }),
    flush: jest.fn(() => Promise.resolve(undefined)),
    publish: jest.fn(),
    request: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    handlers.splice(0);
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CoreNatsDemoService,
        { provide: CoreNatsService, useValue: coreNatsService },
      ],
    }).compile();

    service = moduleRef.get(CoreNatsDemoService);
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
  });

  it('runs the exact subject demo', async () => {
    await service.runExactSubjectDemo();

    expect(coreNatsService.subscribe).toHaveBeenCalledWith('demo.orders.created', expect.any(Function));
    expect(coreNatsService.publish).toHaveBeenCalledWith('demo.orders.created', {
      orderId: 'order-100',
      status: 'created',
    });
    expect(coreNatsService.publish).toHaveBeenCalledWith('demo.orders.updated', {
      orderId: 'order-100',
      status: 'updated',
    });
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('runs the star wildcard demo', async () => {
    await service.runStarWildcardDemo();

    expect(coreNatsService.subscribe).toHaveBeenCalledWith('demo.orders.*', expect.any(Function));
    expect(coreNatsService.publish).toHaveBeenCalledWith('demo.orders.cancelled', {
      orderId: 'order-100',
      status: 'cancelled',
    });
    expect(coreNatsService.publish).toHaveBeenCalledWith('demo.orders.payment.completed', {
      orderId: 'order-100',
      status: 'payment-completed',
    });
  });

  it('runs the greater-than wildcard demo', async () => {
    await service.runGreaterThanWildcardDemo();

    expect(coreNatsService.subscribe).toHaveBeenCalledWith('demo.orders.>', expect.any(Function));
    expect(coreNatsService.publish).toHaveBeenCalledWith('demo.orders.payment.completed', {
      orderId: 'order-100',
      status: 'payment-completed',
    });
  });

  it('runs the fan-out demo with three independent subscribers', async () => {
    await service.runFanOutDemo();

    expect(coreNatsService.subscribe).toHaveBeenCalledTimes(3);
    expect(coreNatsService.subscribe).toHaveBeenNthCalledWith(
      1,
      'demo.jobs.fanout',
      expect.any(Function),
    );
    expect(coreNatsService.subscribe).toHaveBeenNthCalledWith(
      2,
      'demo.jobs.fanout',
      expect.any(Function),
    );
    expect(coreNatsService.subscribe).toHaveBeenNthCalledWith(
      3,
      'demo.jobs.fanout',
      expect.any(Function),
    );
    expect(coreNatsService.publish).toHaveBeenCalledTimes(1);
    expect(coreNatsService.publish).toHaveBeenCalledWith('demo.jobs.fanout', {
      orderId: 'order-100',
      status: 'fanout',
    });
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions[2].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('registers three queue-group workers for one job', async () => {
    await service.runQueueGroupJobDemo({ jobId: 'job-100' });

    expect(coreNatsService.subscribe).toHaveBeenCalledTimes(3);
    for (const call of coreNatsService.subscribe.mock.calls) {
      expect(call).toEqual([
        'demo.jobs.process',
        expect.any(Function),
        { queue: 'demo-workers' },
      ]);
    }
    expect(coreNatsService.publish).toHaveBeenCalledWith('demo.jobs.process', {
      jobId: 'job-100',
    });
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions[2].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('publishes multiple queue-group jobs without testing NATS load balancing internals', async () => {
    await service.runQueueGroupBatchDemo(3);

    expect(coreNatsService.subscribe).toHaveBeenCalledTimes(3);
    expect(coreNatsService.publish).toHaveBeenNthCalledWith(1, 'demo.jobs.process', {
      jobId: 'job-1',
    });
    expect(coreNatsService.publish).toHaveBeenNthCalledWith(2, 'demo.jobs.process', {
      jobId: 'job-2',
    });
    expect(coreNatsService.publish).toHaveBeenNthCalledWith(3, 'demo.jobs.process', {
      jobId: 'job-3',
    });
  });

  it('runs the at-most-once demo sequence', async () => {
    await service.runAtMostOnceDemo();

    expect(coreNatsService.subscribe).toHaveBeenCalledTimes(2);
    expect(coreNatsService.publish).toHaveBeenNthCalledWith(1, 'demo.at-most-once', {
      value: 'message-1',
    });
    expect(coreNatsService.publish).toHaveBeenNthCalledWith(2, 'demo.at-most-once', {
      value: 'message-2',
    });
    expect(coreNatsService.publish).toHaveBeenNthCalledWith(3, 'demo.at-most-once', {
      value: 'message-3',
    });
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('logs received messages from captured handlers', async () => {
    await service.runFanOutDemo();

    await handlers[0]({
      subscriptionSubject: 'demo.jobs.fanout',
      subject: 'demo.jobs.fanout',
      payload: { orderId: 'order-100', status: 'fanout' },
    });

    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RECEIVED] subscriber=Subscriber A'),
    );
  });

  it('logs queue worker identity from captured handlers', async () => {
    await service.runQueueGroupJobDemo({ jobId: 'job-100' });

    await handlers[1]({
      subscriptionSubject: 'demo.jobs.process',
      subject: 'demo.jobs.process',
      payload: { jobId: 'job-100' },
    });

    expect(loggerLogSpy).toHaveBeenCalledWith(expect.stringContaining('[QUEUE WORKER] worker=B'));
  });

  it('requests a user over Core NATS request/reply', async () => {
    coreNatsService.request.mockResolvedValue({
      id: 'user-100',
      name: 'Demo User',
    });

    await expect(service.getUser('user-100')).resolves.toEqual({
      id: 'user-100',
      name: 'Demo User',
    });
    expect(coreNatsService.request).toHaveBeenCalledWith('demo.users.get', {
      userId: 'user-100',
    });
  });

  it('uses a short custom timeout for the timeout demo', async () => {
    coreNatsService.request.mockResolvedValue({ pong: true });

    await expect(service.triggerTimeout()).resolves.toBeUndefined();

    expect(coreNatsService.request).toHaveBeenCalledWith(
      'demo.rpc.slow',
      { ping: true },
      { timeout: 500 },
    );
  });

  it('maps native timeout errors to an HTTP 408 error', async () => {
    coreNatsService.request.mockRejectedValue(new TimeoutError());

    await expect(service.triggerTimeout()).rejects.toMatchObject({
      status: 408,
      response: {
        status: 'error',
        error: 'TIMEOUT',
        subject: 'demo.rpc.slow',
      },
    });
  });

  it('requests an unsubscribed subject for the no-responder demo', async () => {
    coreNatsService.request.mockResolvedValue({});

    await expect(service.triggerNoResponder()).resolves.toBeUndefined();

    expect(coreNatsService.request).toHaveBeenCalledWith(
      'demo.rpc.no-responder',
      { ping: true },
      { timeout: 1000 },
    );
  });

  it('maps native no-responder errors to an HTTP 503 error', async () => {
    coreNatsService.request.mockRejectedValue(
      new RequestError('no responders', {
        cause: new NoRespondersError('demo.rpc.no-responder'),
      }),
    );

    await expect(service.triggerNoResponder()).rejects.toMatchObject({
      status: 503,
      response: {
        status: 'error',
        error: 'NO_RESPONDERS',
        subject: 'demo.rpc.no-responder',
      },
    });
  });

  it('registers request/reply responders on module init and responds with a demo user', async () => {
    const respond = jest.fn();

    await service.onModuleInit();
    await handlers[0]({
      subscriptionSubject: 'demo.users.get',
      subject: 'demo.users.get',
      payload: { userId: 'user-100' },
      reply: '_INBOX.test',
      respond,
    });

    expect(coreNatsService.subscribe).toHaveBeenNthCalledWith(
      1,
      'demo.users.get',
      expect.any(Function),
    );
    expect(coreNatsService.subscribe).toHaveBeenNthCalledWith(
      2,
      'demo.rpc.slow',
      expect.any(Function),
    );
    expect(coreNatsService.flush).toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith({
      id: 'user-100',
      name: 'Demo User',
    });
  });

  it('unsubscribes module-level responders on module destroy', async () => {
    await service.onModuleInit();

    service.onModuleDestroy();

    expect(subscriptions[0].unsubscribe).toHaveBeenCalled();
    expect(subscriptions[1].unsubscribe).toHaveBeenCalled();
  });
});
