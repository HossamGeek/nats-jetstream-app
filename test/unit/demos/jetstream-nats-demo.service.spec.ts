import { Logger } from '@nestjs/common';
import { AckPolicy, DeliverPolicy, JetStreamApiCodes, JetStreamApiError, RetentionPolicy, StorageType } from '@nats-io/jetstream';
import { JetStreamService } from '@infrastructure/nats/jetstream/jetstream.service';
import { StreamService } from '@infrastructure/nats/jetstream/stream.service';
import { JetStreamNatsDemoService } from '../../../src/modules/demos/jetstream-nats/jetstream-nats-demo.service';

const streamInfo = (name: string, overrides: Record<string, unknown> = {}) => ({
  config: {
    name,
    subjects: [`${name.toLowerCase()}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: -1,
    max_bytes: -1,
    max_age: 0,
    ...(overrides.config as object | undefined),
  },
  state: {
    messages: 0,
    bytes: 0,
    first_seq: 0,
    last_seq: 0,
    consumer_count: 0,
    num_subjects: 0,
    subjects: {},
    ...(overrides.state as object | undefined),
  },
});

const notFound = (code: number): JetStreamApiError => {
  const error = Object.create(JetStreamApiError.prototype) as JetStreamApiError;
  Object.defineProperty(error, 'code', { get: () => code });
  Object.defineProperty(error, 'message', { get: () => 'not found' });
  return error;
};

describe('JetStreamNatsDemoService', () => {
  let service: JetStreamNatsDemoService;
  let loggerSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const streamService = {
    create: jest.fn(),
    getInfo: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const jetStreamClient = {
    publish: jest.fn(),
    consumers: {
      get: jest.fn(),
    },
  };
  const jetStreamManager = {
    consumers: {
      add: jest.fn(),
      delete: jest.fn(),
    },
  };
  const jetStreamService = {
    getClient: jest.fn(() => Promise.resolve(jetStreamClient)),
    getManager: jest.fn(() => Promise.resolve(jetStreamManager)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    streamService.delete.mockResolvedValue(true);
    streamService.create.mockImplementation((cfg: { name: string }) => Promise.resolve(streamInfo(cfg.name, { config: cfg })));
    streamService.getInfo.mockImplementation((name: string) => Promise.resolve(streamInfo(name)));
    streamService.update.mockImplementation((name: string, cfg: object) => Promise.resolve(streamInfo(name, { config: cfg })));
    jetStreamClient.publish.mockResolvedValue({ stream: 'DEMO_JS_TEST', seq: 1 });
    jetStreamManager.consumers.add.mockResolvedValue({});
    jetStreamManager.consumers.delete.mockResolvedValue(true);
    jetStreamService.getClient.mockResolvedValue(jetStreamClient);
    jetStreamService.getManager.mockResolvedValue(jetStreamManager);
    service = new JetStreamNatsDemoService(
      streamService as unknown as StreamService,
      jetStreamService as unknown as JetStreamService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    loggerSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('creates max-msgs demo stream with required native config and sequence evidence', async () => {
    streamService.getInfo.mockResolvedValue(streamInfo('DEMO_JS_LIMITS_MAX_MSGS', {
      config: { max_msgs: 3 },
      state: { messages: 3, first_seq: 3, last_seq: 5 },
    }));

    const result = await service.runMaxMessagesLimitDemo();

    expect(streamService.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'DEMO_JS_LIMITS_MAX_MSGS',
      subjects: ['demo.js.limits.max-msgs'],
      storage: StorageType.File,
      retention: RetentionPolicy.Limits,
      max_consumers: -1,
      max_msgs: 3,
      max_msg_size: -1,
      num_replicas: 1,
    }));
    expect(jetStreamClient.publish).toHaveBeenCalledTimes(5);
    expect(result.evidence).toMatchObject({
      publishedCount: 5,
      expectedRetainedMessages: 3,
    });
    expect(result.evidence.afterPublishFive).toMatchObject({ messages: 3, first_seq: 3, last_seq: 5 });
  });

  it('runs stream CRUD with create/read/update/delete evidence and final cleanup', async () => {
    const created = streamInfo('DEMO_JS_CRUD', { state: { messages: 0 } });
    const read = streamInfo('DEMO_JS_CRUD', { config: { subjects: ['demo.js.crud.created'] } });
    const updated = streamInfo('DEMO_JS_CRUD', { config: { description: 'updated by stream CRUD demo', subjects: ['demo.js.crud.created', 'demo.js.crud.updated'] } });
    streamService.create.mockResolvedValueOnce(created);
    streamService.getInfo.mockResolvedValueOnce(read);
    streamService.update.mockResolvedValueOnce(updated);

    const result = await service.runStreamCrudDemo();

    expect(streamService.delete).toHaveBeenNthCalledWith(1, 'DEMO_JS_CRUD');
    expect(streamService.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'DEMO_JS_CRUD', subjects: ['demo.js.crud.created'] }));
    expect(streamService.update).toHaveBeenCalledWith('DEMO_JS_CRUD', expect.objectContaining({
      description: 'updated by stream CRUD demo',
      subjects: ['demo.js.crud.created', 'demo.js.crud.updated'],
    }));
    expect(result).toMatchObject({
      scenario: 'stream-crud',
      stream: 'DEMO_JS_CRUD',
      evidence: { deleted: true, updated: { subjects: ['demo.js.crud.created', 'demo.js.crud.updated'] } },
    });
    expect(streamService.delete).toHaveBeenLastCalledWith('DEMO_JS_CRUD');
  });

  it('runs hierarchical subjects demo and returns subject-filter evidence', async () => {
    streamService.getInfo
      .mockResolvedValueOnce(streamInfo('DEMO_JS_HIERARCHY', { state: { subjects: { 'demo.js.orders.created': 1 } } }))
      .mockResolvedValueOnce(streamInfo('DEMO_JS_HIERARCHY', {
        config: { subjects: ['demo.js.orders.>'] },
        state: { messages: 3, bytes: 99, num_subjects: 3 },
      }));

    const result = await service.runHierarchicalSubjectsDemo();

    expect(jetStreamClient.publish).toHaveBeenCalledTimes(3);
    expect(streamService.getInfo).toHaveBeenCalledWith('DEMO_JS_HIERARCHY', { subjects_filter: 'demo.js.orders.*' });
    expect(result.evidence).toMatchObject({ messagesStored: 3, bytesStored: 99, numSubjects: 3 });
  });

  it('runs storage demo with file and memory configs and evidence', async () => {
    streamService.getInfo.mockImplementation((name: string) => Promise.resolve(streamInfo(name, {
      config: { storage: name.endsWith('MEMORY') ? StorageType.Memory : StorageType.File },
      state: { messages: 1, bytes: 20 },
    })));

    const result = await service.runStorageDemo();

    expect(streamService.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'DEMO_JS_FILE', storage: StorageType.File }));
    expect(streamService.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'DEMO_JS_MEMORY', storage: StorageType.Memory }));
    expect(result.file.evidence).toMatchObject({ storage: StorageType.File, state: { messages: 1 } });
    expect(result.memory.evidence).toMatchObject({ storage: StorageType.Memory, state: { messages: 1 } });
  });

  it('runs combined limits demo and nests each public limit result', async () => {
    let maxBytesReads = 0;
    streamService.getInfo.mockImplementation((name: string) => {
      if (name.endsWith('MAX_MSGS')) return Promise.resolve(streamInfo(name, { config: { max_msgs: 3 }, state: { messages: 3 } }));
      if (name.endsWith('MAX_BYTES')) {
        maxBytesReads += 1;
        return Promise.resolve(streamInfo(name, { config: { max_bytes: 360 }, state: { bytes: 200, first_seq: maxBytesReads === 1 ? 1 : 2 } }));
      }
      return Promise.resolve(streamInfo(name, { config: { max_age: 500_000_000 }, state: { messages: 0 } }));
    });

    const result = await service.runLimitsDemo();

    expect(streamService.delete).toHaveBeenCalledWith('DEMO_JS_LIMITS');
    expect(result.evidence.maxMessages).toMatchObject({ scenario: 'limits-max-msgs' });
    expect(result.evidence.maxBytes).toMatchObject({ scenario: 'limits-max-bytes' });
    expect(result.evidence.maxAge).toMatchObject({ scenario: 'limits-max-age' });
  });

  it('creates independent max-bytes and max-age limit streams', async () => {
    let maxBytesReads = 0;
    streamService.getInfo.mockImplementation((name: string) => {
      if (name.endsWith('MAX_BYTES')) {
        maxBytesReads += 1;
        return Promise.resolve(streamInfo(name, {
          config: { max_msgs: -1, max_age: 0, max_bytes: 360 },
          state: { messages: 2, first_seq: maxBytesReads === 1 ? 1 : 2, last_seq: maxBytesReads === 1 ? 2 : 3, bytes: 200 },
        }));
      }
      return Promise.resolve(streamInfo(name, {
        config: { max_msgs: -1, max_age: 500_000_000, max_bytes: -1 },
        state: { messages: 0, first_seq: 1, last_seq: 1, bytes: 0 },
      }));
    });

    const maxBytes = await service.runMaxBytesLimitDemo();
    const maxAge = await service.runMaxAgeLimitDemo();

    expect(streamService.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'DEMO_JS_LIMITS_MAX_BYTES',
      subjects: ['demo.js.limits.max-bytes'],
      max_msgs: -1,
      max_age: 0,
      max_bytes: 360,
    }));
    expect(streamService.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'DEMO_JS_LIMITS_MAX_AGE',
      subjects: ['demo.js.limits.max-age'],
      max_msgs: -1,
      max_bytes: -1,
      max_age: 500_000_000,
    }));
    expect(maxBytes.evidence).toMatchObject({
      publishedCount: 3,
      payloadValueBytes: 80,
      conditionSatisfied: true,
    });
    expect(maxAge.evidence).toMatchObject({
      publishedCount: 1,
      expectedBeforeMessages: 1,
      expectedAfterMessages: 0,
      pollIntervalMs: 100,
      conditionSatisfied: true,
    });
  });

  it('throws a clear public-scenario timeout when the expected max-age condition is not satisfied', async () => {
    jest.useFakeTimers();
    try {
      streamService.getInfo.mockResolvedValue(streamInfo('DEMO_JS_LIMITS_MAX_AGE', {
        state: { messages: 1, first_seq: 1, last_seq: 1 },
      }));
      const run = service.runMaxAgeLimitDemo();
      const expectation = expect(run).rejects.toThrow(/Timed out after 4000ms waiting for JetStream stream=DEMO_JS_LIMITS_MAX_AGE/);
      await jest.advanceTimersByTimeAsync(4100);

      await expectation;
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses demo-local native consumers for WorkQueue ACK evidence', async () => {
    const message = {
      subject: 'demo.js.workqueue.jobs',
      info: { streamSequence: 1, deliverySequence: 1 },
      ackAck: jest.fn(() => Promise.resolve(true)),
    };
    jetStreamClient.consumers.get.mockResolvedValue({
      next: jest.fn(() => Promise.resolve(message)),
    });

    const result = await service.runWorkQueueAckDemo();

    expect(jetStreamManager.consumers.add).toHaveBeenCalledWith('DEMO_JS_WORKQUEUE', expect.objectContaining({
      name: 'demo_wq_worker',
      durable_name: 'demo_wq_worker',
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
    }));
    expect(jetStreamClient.consumers.get).toHaveBeenCalledWith('DEMO_JS_WORKQUEUE', 'demo_wq_worker');
    expect(message.ackAck).toHaveBeenCalledWith({ timeout: 1000 });
    expect(result.evidence).toMatchObject({
      delivered: { subject: 'demo.js.workqueue.jobs', streamSequence: 1, deliverySequence: 1 },
      ackConfirmed: true,
    });
    expect(jetStreamManager.consumers.delete).toHaveBeenCalledWith('DEMO_JS_WORKQUEUE', 'demo_wq_worker');
  });

  it('runs Interest retention with two consumers and ACK evidence', async () => {
    const messageA = { subject: 'demo.js.interest.events', info: { streamSequence: 1, deliverySequence: 1 }, ackAck: jest.fn(() => Promise.resolve(true)) };
    const messageB = { subject: 'demo.js.interest.events', info: { streamSequence: 1, deliverySequence: 1 }, ackAck: jest.fn(() => Promise.resolve(true)) };
    jetStreamClient.consumers.get
      .mockResolvedValueOnce({ next: jest.fn(() => Promise.resolve(messageA)) })
      .mockResolvedValueOnce({ next: jest.fn(() => Promise.resolve(messageB)) });
    streamService.getInfo
      .mockResolvedValueOnce(streamInfo('DEMO_JS_INTEREST', { state: { messages: 1 } }))
      .mockResolvedValueOnce(streamInfo('DEMO_JS_INTEREST', { state: { messages: 1 } }))
      .mockResolvedValueOnce(streamInfo('DEMO_JS_INTEREST', { state: { messages: 0 } }));

    const result = await service.runInterestAckDemo();

    expect(streamService.create).toHaveBeenCalledWith(expect.objectContaining({ retention: RetentionPolicy.Interest }));
    expect(jetStreamManager.consumers.add).toHaveBeenCalledWith('DEMO_JS_INTEREST', expect.objectContaining({ name: 'demo_interest_a' }));
    expect(jetStreamManager.consumers.add).toHaveBeenCalledWith('DEMO_JS_INTEREST', expect.objectContaining({ name: 'demo_interest_b' }));
    expect(result.evidence).toMatchObject({ ackAConfirmed: true, ackBConfirmed: true, afterBothAck: { messages: 0 } });
  });

  it('records false ACK evidence when next returns null or ackAck resolves false', async () => {
    jetStreamClient.consumers.get.mockResolvedValueOnce({ next: jest.fn(() => Promise.resolve(null)) });
    const workQueue = await service.runWorkQueueAckDemo();
    const message = { subject: 'demo.js.interest.events', info: { streamSequence: 1, deliverySequence: 1 }, ackAck: jest.fn(() => Promise.resolve(false)) };
    jetStreamClient.consumers.get
      .mockResolvedValueOnce({ next: jest.fn(() => Promise.resolve(message)) })
      .mockResolvedValueOnce({ next: jest.fn(() => Promise.resolve(null)) });
    streamService.getInfo
      .mockResolvedValueOnce(streamInfo('DEMO_JS_INTEREST', { state: { messages: 1 } }))
      .mockResolvedValueOnce(streamInfo('DEMO_JS_INTEREST', { state: { messages: 1 } }))
      .mockResolvedValueOnce(streamInfo('DEMO_JS_INTEREST', { state: { messages: 0 } }));
    const interest = await service.runInterestAckDemo();

    expect(workQueue.evidence).toMatchObject({ delivered: null, ackConfirmed: false });
    expect(interest.evidence).toMatchObject({ ackAConfirmed: false, ackBConfirmed: false, consumerB: null });
  });

  it('propagates create failures and still attempts cleanup', async () => {
    const createError = new Error('create failed');
    streamService.create.mockRejectedValueOnce(createError);

    await expect(service.runMaxMessagesLimitDemo()).rejects.toBe(createError);

    expect(streamService.delete).toHaveBeenLastCalledWith('DEMO_JS_LIMITS_MAX_MSGS');
  });

  it('propagates read failures and still attempts cleanup', async () => {
    const readError = new Error('read failed');
    streamService.getInfo.mockRejectedValueOnce(readError);

    await expect(service.runHierarchicalSubjectsDemo()).rejects.toBe(readError);

    expect(streamService.delete).toHaveBeenLastCalledWith('DEMO_JS_HIERARCHY');
  });

  it('propagates update failures and still attempts cleanup', async () => {
    const updateError = new Error('update failed');
    streamService.getInfo.mockResolvedValueOnce(streamInfo('DEMO_JS_CRUD'));
    streamService.update.mockRejectedValueOnce(updateError);

    await expect(service.runStreamCrudDemo()).rejects.toBe(updateError);

    expect(streamService.delete).toHaveBeenLastCalledWith('DEMO_JS_CRUD');
  });

  it('propagates consumer creation failures and still attempts cleanup', async () => {
    const consumerError = new Error('consumer failed');
    jetStreamManager.consumers.add.mockRejectedValueOnce(consumerError);

    await expect(service.runWorkQueueAckDemo()).rejects.toBe(consumerError);
    expect(jetStreamManager.consumers.delete).toHaveBeenCalledWith('DEMO_JS_WORKQUEUE', 'demo_wq_worker');
    expect(streamService.delete).toHaveBeenLastCalledWith('DEMO_JS_WORKQUEUE');
  });

  it('propagates next-message failures and still attempts cleanup', async () => {
    const nextError = new Error('next failed');
    jetStreamClient.consumers.get.mockResolvedValueOnce({ next: jest.fn(() => Promise.reject(nextError)) });

    await expect(service.runWorkQueueAckDemo()).rejects.toBe(nextError);
    expect(jetStreamManager.consumers.delete).toHaveBeenCalledWith('DEMO_JS_WORKQUEUE', 'demo_wq_worker');
  });

  it('propagates ACK failures and still attempts cleanup', async () => {
    const ackError = new Error('ack failed');
    jetStreamClient.consumers.get.mockResolvedValueOnce({
      next: jest.fn(() => Promise.resolve({ subject: 'demo.js.workqueue.jobs', info: { streamSequence: 1, deliverySequence: 1 }, ackAck: jest.fn(() => Promise.reject(ackError)) })),
    });

    await expect(service.runWorkQueueAckDemo()).rejects.toBe(ackError);
    expect(jetStreamManager.consumers.delete).toHaveBeenCalledWith('DEMO_JS_WORKQUEUE', 'demo_wq_worker');
  });

  it('swallows stream and consumer not-found cleanup errors but propagates other cleanup errors', async () => {
    streamService.delete.mockRejectedValueOnce(notFound(JetStreamApiCodes.StreamNotFound));
    jetStreamManager.consumers.delete.mockRejectedValueOnce(notFound(JetStreamApiCodes.ConsumerNotFound));

    await expect(service.runWorkQueueAckDemo()).resolves.toMatchObject({ scenario: 'workqueue-ack' });

    const cleanupError = new Error('delete unavailable');
    streamService.delete.mockRejectedValueOnce(cleanupError);
    await expect(service.runMaxMessagesLimitDemo()).rejects.toBe(cleanupError);
  });

  it('propagates post-success stream cleanup failures', async () => {
    const cleanupError = new Error('delete unavailable after success');
    streamService.delete.mockResolvedValueOnce(true).mockRejectedValueOnce(cleanupError);

    await expect(service.runMaxMessagesLimitDemo()).rejects.toBe(cleanupError);
  });

  it('propagates non-not-found consumer cleanup failures after success and still attempts stream cleanup', async () => {
    const cleanupError = new Error('consumer delete unavailable');
    jetStreamManager.consumers.delete.mockRejectedValueOnce(cleanupError);

    await expect(service.runWorkQueueAckDemo()).rejects.toBe(cleanupError);

    expect(streamService.delete).toHaveBeenLastCalledWith('DEMO_JS_WORKQUEUE');
  });

  it('cleans up both storage streams when memory setup fails', async () => {
    const createError = new Error('memory create failed');
    streamService.create
      .mockImplementationOnce((cfg: { name: string }) => Promise.resolve(streamInfo(cfg.name, { config: cfg })))
      .mockRejectedValueOnce(createError);

    await expect(service.runStorageDemo()).rejects.toBe(createError);

    expect(streamService.delete).toHaveBeenNthCalledWith(1, 'DEMO_JS_FILE');
    expect(streamService.delete).toHaveBeenNthCalledWith(2, 'DEMO_JS_MEMORY');
    expect(streamService.delete).toHaveBeenNthCalledWith(3, 'DEMO_JS_FILE');
    expect(streamService.delete).toHaveBeenNthCalledWith(4, 'DEMO_JS_MEMORY');
  });

  it('attempts all cleanup resources, logs cleanup failures, and rethrows the exact primitive primary rejection', async () => {
    const primary = 'storage publish failed';
    const cleanupA = new Error('file cleanup failed');
    const cleanupB = new Error('memory cleanup failed');
    jetStreamClient.publish.mockRejectedValueOnce(primary);
    streamService.delete
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(cleanupA)
      .mockRejectedValueOnce(cleanupB);

    await expect(service.runStorageDemo()).rejects.toBe(primary);

    expect(streamService.delete).toHaveBeenCalledWith('DEMO_JS_FILE');
    expect(streamService.delete).toHaveBeenCalledWith('DEMO_JS_MEMORY');
    expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
    expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('primary error=storage publish failed'));
  });

  it('logs cleanup failures and rethrows the exact frozen primary rejection without mutation', async () => {
    const primary = Object.freeze({ reason: 'frozen primary' });
    const cleanupError = new Error('hierarchy cleanup failed');
    jetStreamClient.publish.mockRejectedValueOnce(primary);
    streamService.delete.mockResolvedValueOnce(true).mockRejectedValueOnce(cleanupError);

    await expect(service.runHierarchicalSubjectsDemo()).rejects.toBe(primary);

    expect(Object.isFrozen(primary)).toBe(true);
    expect(primary).toEqual({ reason: 'frozen primary' });
    expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('hierarchy cleanup failed'));
  });

  it('propagates native publish errors unchanged', async () => {
    const nativeError = new Error('no stream matches subject');
    jetStreamClient.publish.mockRejectedValue(nativeError);

    await expect(service.runHierarchicalSubjectsDemo()).rejects.toBe(nativeError);
  });

  it('gets native JetStream manager and client through JetStreamService', async () => {
    await service.runWorkQueueAckDemo();

    expect(jetStreamService.getManager).toHaveBeenCalled();
    expect(jetStreamService.getClient).toHaveBeenCalled();
  });
});
