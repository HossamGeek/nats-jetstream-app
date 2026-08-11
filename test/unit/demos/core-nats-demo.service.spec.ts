import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CoreNatsDemoService } from '../../../src/demos/core-nats/core-nats-demo.service';
import { CoreNatsService } from '../../../src/infrastructure/nats/core/core-nats.service';
import type { CoreNatsMessageHandler } from '../../../src/shared/interfaces/nats/core-nats.types';

describe('CoreNatsDemoService', () => {
  let service: CoreNatsDemoService;
  let loggerLogSpy: jest.SpyInstance;
  const subscriptions = [
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

  it('runs the fan-out demo with two independent subscribers', async () => {
    await service.runFanOutDemo();

    expect(coreNatsService.subscribe).toHaveBeenCalledTimes(2);
    expect(coreNatsService.subscribe).toHaveBeenNthCalledWith(
      1,
      'demo.orders.created',
      expect.any(Function),
    );
    expect(coreNatsService.subscribe).toHaveBeenNthCalledWith(
      2,
      'demo.orders.created',
      expect.any(Function),
    );
    expect(coreNatsService.publish).toHaveBeenCalledTimes(1);
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1);
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
      subscriptionSubject: 'demo.orders.created',
      subject: 'demo.orders.created',
      payload: { orderId: 'order-100', status: 'created' },
    });

    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RECEIVED] subscriber=Subscriber A'),
    );
  });

  it('creates consistent demo responses', () => {
    expect(service.createResponse('exact', 'done')).toEqual({
      demo: 'exact',
      status: 'started-and-finished',
      observation: 'done',
    });
  });
});
