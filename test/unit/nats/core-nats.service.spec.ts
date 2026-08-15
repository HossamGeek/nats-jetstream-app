import { Logger } from '@nestjs/common';
import { CoreNatsService } from '@infrastructure/nats/core/core-nats.service';
import { NatsService } from '@infrastructure/nats/nats.service';
import {
  NoRespondersError,
  RequestError,
  TimeoutError,
} from '@nats-io/transport-node';
import { DEFAULT_CORE_NATS_REQUEST_TIMEOUT_MS } from '@shared/constants/nats.constants';
import type { CoreNatsMessageHandler } from '@shared/interfaces/nats/core-nats.types';

const encodeJson = (payload: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(payload));

type TestNatsMessage = {
  subject: string;
  data: Uint8Array;
  reply?: string;
  respond?: jest.Mock;
};

type TestSubscribeCallback = (error: Error | null, message: TestNatsMessage) => void;

type TestSubscribeOptions = {
  queue?: string;
  callback: TestSubscribeCallback;
};

describe('CoreNatsService', () => {
  let service: CoreNatsService;
  let loggerErrorSpy: jest.SpyInstance;

  const nativeSubscription = {
    closed: Promise.resolve(undefined),
    unsubscribe: jest.fn(),
    drain: jest.fn(() => Promise.resolve(undefined)),
    isClosed: jest.fn(() => false),
    isDraining: jest.fn(() => false),
    getReceived: jest.fn(() => 1),
    getProcessed: jest.fn(() => 1),
  };

  const connection = {
    publish: jest.fn(),
    request: jest.fn(),
    flush: jest.fn(() => Promise.resolve(undefined)),
    subscribe: jest.fn((subject: string, options: TestSubscribeOptions) => {
      void subject;
      void options;
      return nativeSubscription;
    }),
  };

  const getSubscribeCallback = (): TestSubscribeCallback => {
    const options = connection.subscribe.mock.calls[0][1];
    return options.callback;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    service = new CoreNatsService({ connection } as unknown as NatsService);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('publishes JSON-encoded payloads through the shared connection', () => {
    const payload = { orderId: 'order-100', status: 'created' };

    service.publish('demo.orders.created', payload);

    expect(connection.publish).toHaveBeenCalledTimes(1);
    const [subject, data] = connection.publish.mock.calls[0] as [string, Uint8Array];
    expect(subject).toBe('demo.orders.created');
    expect(JSON.parse(new TextDecoder().decode(data)) as unknown).toEqual(payload);
  });

  it('throws when publishing a non JSON-serializable payload', () => {
    expect(() => service.publish('demo.invalid', undefined)).toThrow(/JSON-serializable/);
    expect(connection.publish).not.toHaveBeenCalled();
  });

  it('delegates flush to the shared connection', async () => {
    await service.flush();

    expect(connection.flush).toHaveBeenCalledTimes(1);
  });

  it('requests with a JSON-encoded payload and the default timeout', async () => {
    const payload = { userId: 'user-100' };
    connection.request.mockResolvedValue({
      data: encodeJson({ id: 'user-100', name: 'Demo User' }),
    });

    const response = await service.request<
      { userId: string },
      { id: string; name: string }
    >('demo.users.get', payload);

    expect(connection.request).toHaveBeenCalledTimes(1);
    const [subject, data, options] = connection.request.mock.calls[0] as [
      string,
      Uint8Array,
      { timeout: number },
    ];
    expect(subject).toBe('demo.users.get');
    expect(JSON.parse(new TextDecoder().decode(data)) as unknown).toEqual(payload);
    expect(options).toEqual({ timeout: DEFAULT_CORE_NATS_REQUEST_TIMEOUT_MS });
    expect(response).toEqual({ id: 'user-100', name: 'Demo User' });
  });

  it('requests with a custom timeout when provided', async () => {
    connection.request.mockResolvedValue({ data: encodeJson({}) });

    await service.request('demo.rpc.slow', { ping: true }, { timeout: 500 });

    const [subject, , options] = connection.request.mock.calls[0] as [
      string,
      Uint8Array,
      { timeout: number },
    ];
    expect(subject).toBe('demo.rpc.slow');
    expect(options).toEqual({ timeout: 500 });
  });

  it('decodes the native request response payload', async () => {
    connection.request.mockResolvedValue({
      data: encodeJson({ id: 'user-7', name: 'Demo User' }),
    });

    const response = await service.request('demo.users.get', { userId: 'user-7' });

    expect(response).toEqual({ id: 'user-7', name: 'Demo User' });
  });

  it('propagates native no-responders errors unchanged', async () => {
    const noResponders = new NoRespondersError('demo.rpc.no-responder');
    connection.request.mockRejectedValue(noResponders);

    await expect(
      service.request('demo.rpc.no-responder', { ping: true }, { timeout: 1000 }),
    ).rejects.toBe(noResponders);
  });

  it('propagates native RequestError unchanged', async () => {
    const requestError = new RequestError('request failed', {
      cause: new NoRespondersError('demo.rpc.no-responder'),
    });
    connection.request.mockRejectedValue(requestError);

    await expect(
      service.request('demo.rpc.no-responder', { ping: true }),
    ).rejects.toBe(requestError);
  });

  it('propagates native timeout errors unchanged', async () => {
    const timeoutError = new TimeoutError();
    connection.request.mockRejectedValue(timeoutError);

    const timeoutPromise = service.request(
      'demo.rpc.slow',
      { ping: true },
      { timeout: 500 },
    );

    await expect(timeoutPromise).rejects.toBe(timeoutError);
  });

  it('propagates unexpected request errors unchanged', async () => {
    const unexpected = new Error('permission violation');
    connection.request.mockRejectedValue(unexpected);

    await expect(service.request('demo.private', { ping: true })).rejects.toThrow(
      'permission violation',
    );
    await expect(service.request('demo.private', { ping: true })).rejects.toBe(
      unexpected,
    );
  });

  it('subscribes and returns a lifecycle wrapper', async () => {
    const handler: CoreNatsMessageHandler<{ status: string }> = jest.fn();

    const subscription = service.subscribe('demo.orders.*', handler);
    subscription.unsubscribe(2);
    await subscription.drain();

    expect(connection.subscribe.mock.calls[0][0]).toBe('demo.orders.*');
    expect(typeof connection.subscribe.mock.calls[0][1].callback).toBe('function');
    expect(subscription.subject).toBe('demo.orders.*');
    expect(subscription.nativeSubscription).toBe(nativeSubscription);
    expect(subscription.closed).toBe(nativeSubscription.closed);
    expect(nativeSubscription.unsubscribe).toHaveBeenCalledWith(2);
    expect(nativeSubscription.drain).toHaveBeenCalledTimes(1);
    expect(subscription.isClosed()).toBe(false);
    expect(subscription.isDraining()).toBe(false);
    expect(subscription.getReceived()).toBe(1);
    expect(subscription.getProcessed()).toBe(1);
  });

  it('forwards queue group options to the native subscription', () => {
    const handler: CoreNatsMessageHandler<{ jobId: string }> = jest.fn();

    const subscription = service.subscribe('demo.jobs.process', handler, {
      queue: 'demo-workers',
    });

    const [, options] = connection.subscribe.mock.calls[0];
    expect(connection.subscribe.mock.calls[0][0]).toBe('demo.jobs.process');
    expect(options.queue).toBe('demo-workers');
    expect(typeof options.callback).toBe('function');
    expect(subscription.queue).toBe('demo-workers');
  });

  it('subscribes without a queue group by default', () => {
    const handler: CoreNatsMessageHandler<{ status: string }> = jest.fn();

    const subscription = service.subscribe('demo.orders.*', handler);

    const [, options] = connection.subscribe.mock.calls[0];
    expect(connection.subscribe.mock.calls[0][0]).toBe('demo.orders.*');
    expect(options.queue).toBeUndefined();
    expect(typeof options.callback).toBe('function');
    expect(subscription.queue).toBeUndefined();
  });

  it('decodes callback messages and passes subscription, actual subject, reply, and respond to the handler', async () => {
    type OrderPayload = { orderId: string; status: string };
    const handler: jest.MockedFunction<CoreNatsMessageHandler<OrderPayload>> =
      jest.fn();
    const payload = { orderId: 'order-100', status: 'created' };
    const reply = '_INBOX.abc123';
    const nativeRespond = jest.fn(() => true);

    service.subscribe('demo.orders.*', handler);
    const callback = getSubscribeCallback();
    callback(null, {
      subject: 'demo.orders.created',
      data: encodeJson(payload),
      reply,
      respond: nativeRespond,
    });
    await Promise.resolve();

    const [delivered] = handler.mock.calls[0];
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionSubject: 'demo.orders.*',
      subject: 'demo.orders.created',
      payload,
      reply,
    }));

    expect(typeof delivered.respond).toBe('function');
    const response = { status: 'ack' };
    expect(delivered.respond(response)).toBe(true);
    expect(nativeRespond).toHaveBeenCalledWith(encodeJson(response));
  });

  it('logs native subscription callback errors without invoking the handler', () => {
    const handler = jest.fn();

    service.subscribe('demo.orders.*', handler);
    const callback = getSubscribeCallback();
    callback(new Error('permission violation'), {
      subject: 'demo.orders.created',
      data: encodeJson({}),
    });

    expect(handler).not.toHaveBeenCalled();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('permission violation'),
      expect.any(String),
    );
  });

  it('logs handler failures without throwing from the native callback', async () => {
    const handler = jest.fn(() => {
      throw new Error('handler failed');
    });

    service.subscribe('demo.orders.*', handler);
    const callback = getSubscribeCallback();

    expect(() =>
      callback(null, {
        subject: 'demo.orders.created',
        data: encodeJson({ status: 'created' }),
      }),
    ).not.toThrow();
    await Promise.resolve();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('handler failed'),
      expect.any(String),
    );
  });
});
