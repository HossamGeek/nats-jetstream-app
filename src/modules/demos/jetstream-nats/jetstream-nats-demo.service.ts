import { Injectable, Logger } from '@nestjs/common';
import {
  AckPolicy,
  DeliverPolicy,
  JetStreamApiCodes,
  JetStreamApiError,
  RetentionPolicy,
  StorageType,
  type ConsumerConfig,
  type JsMsg,
  type StreamConfig,
  type StreamInfo,
} from '@nats-io/jetstream';
import { JetStreamService } from '@infrastructure/nats/jetstream/jetstream.service';
import { StreamService } from '@infrastructure/nats/jetstream/stream.service';
import {
  JETSTREAM_DEMO_STREAM_PREFIX,
  JetStreamDemoConsumer,
  JetStreamDemoStream,
} from '@shared/constants/jetstream-demo.constants';
import type { JetStreamScenarioEvidence } from '@shared/interfaces/demos/jetstream-nats-demo.types';

const HALF_SECOND_IN_NANOS = 500_000_000;
const ACK_TIMEOUT_MS = 1000;
const POLL_INTERVAL_MS = 100;

@Injectable()
export class JetStreamNatsDemoService {
  private readonly logger = new Logger(JetStreamNatsDemoService.name);
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly streamService: StreamService,
    private readonly jetStreamService: JetStreamService,
  ) {}

  async runStreamCrudDemo(): Promise<JetStreamScenarioEvidence> {
    const stream = JetStreamDemoStream.Crud;
    await this.cleanupStream(stream);
    return this.withCleanup(async () => {
      const created = await this.streamService.create(this.baseStreamConfig(stream, ['demo.js.crud.created']));
      const read = await this.streamService.getInfo(stream);
      const updated = await this.streamService.update(stream, {
        ...read.config,
        description: 'updated by stream CRUD demo',
        subjects: ['demo.js.crud.created', 'demo.js.crud.updated'],
      });
      const deleted = await this.streamService.delete(stream);
      return this.evidence('stream-crud', stream, {
        created: this.streamSnapshot(created),
        read: this.streamSnapshot(read),
        updated: this.streamSnapshot(updated),
        deleted,
      });
    }, [() => this.cleanupStream(stream)]);
  }

  async runHierarchicalSubjectsDemo(): Promise<JetStreamScenarioEvidence> {
    const stream = JetStreamDemoStream.Hierarchy;
    await this.resetStream(stream, this.baseStreamConfig(stream, ['demo.js.orders.>']));
    return this.withCleanup(async () => {
      await this.publishJson('demo.js.orders.created', { orderId: 'order-1' });
      await this.publishJson('demo.js.orders.payment.completed', { orderId: 'order-2' });
      await this.publishJson('demo.js.orders.shipping.label.created', { orderId: 'order-3' });
      const info = await this.streamService.getInfo(stream, { subjects_filter: 'demo.js.orders.*' });
      const finalInfo = await this.streamService.getInfo(stream);
      return this.evidence('hierarchical-subjects', stream, {
        configuredSubjects: finalInfo.config.subjects,
        messagesStored: finalInfo.state.messages,
        bytesStored: finalInfo.state.bytes,
        filteredOneTokenSubjects: info.state.subjects,
        numSubjects: finalInfo.state.num_subjects,
      });
    }, [() => this.cleanupStream(stream)]);
  }

  async runStorageDemo(): Promise<{ file: JetStreamScenarioEvidence; memory: JetStreamScenarioEvidence }> {
    const fileStream = JetStreamDemoStream.File;
    const memoryStream = JetStreamDemoStream.Memory;
    return this.withCleanup(async () => {
      await this.resetStream(fileStream, this.baseStreamConfig(fileStream, ['demo.js.storage.file'], StorageType.File));
      await this.resetStream(memoryStream, this.baseStreamConfig(memoryStream, ['demo.js.storage.memory'], StorageType.Memory));
      await this.publishJson('demo.js.storage.file', { storage: 'file' });
      await this.publishJson('demo.js.storage.memory', { storage: 'memory' });
      const fileInfo = await this.streamService.getInfo(fileStream);
      const memoryInfo = await this.streamService.getInfo(memoryStream);
      return {
        file: this.evidence('storage-file', fileStream, this.streamSnapshot(fileInfo)),
        memory: this.evidence('storage-memory', memoryStream, this.streamSnapshot(memoryInfo)),
      };
    }, [() => this.cleanupStream(fileStream), () => this.cleanupStream(memoryStream)]);
  }

  async runLimitsDemo(): Promise<JetStreamScenarioEvidence> {
    await this.cleanupStream(JetStreamDemoStream.Limits);
    return this.evidence('limits-combined', JetStreamDemoStream.Limits, {
      maxMessages: await this.runMaxMessagesLimitDemo(),
      maxBytes: await this.runMaxBytesLimitDemo(),
      maxAge: await this.runMaxAgeLimitDemo(),
    });
  }

  async runMaxMessagesLimitDemo(): Promise<JetStreamScenarioEvidence> {
    const stream = JetStreamDemoStream.LimitsMaxMessages;
    await this.resetStream(stream, {
      ...this.baseStreamConfig(stream, ['demo.js.limits.max-msgs']),
      max_msgs: 3,
    });
    return this.withCleanup(async () => {
      for (let id = 1; id <= 5; id += 1) {
        await this.publishJson('demo.js.limits.max-msgs', { id });
      }
      const afterMaxMessages = await this.streamService.getInfo(stream);
      return this.evidence('limits-max-msgs', stream, {
        publishedCount: 5,
        expectedRetainedMessages: 3,
        configured: {
          max_msgs: afterMaxMessages.config.max_msgs,
        },
        afterPublishFive: this.stateSnapshot(afterMaxMessages),
      });
    }, [() => this.cleanupStream(stream)]);
  }

  async runMaxBytesLimitDemo(): Promise<JetStreamScenarioEvidence> {
    const stream = JetStreamDemoStream.LimitsMaxBytes;
    await this.resetStream(stream, {
      ...this.baseStreamConfig(stream, ['demo.js.limits.max-bytes']),
      max_msgs: -1,
      max_age: 0,
      max_bytes: 360,
    });
    return this.withCleanup(async () => {
      const payloadValueBytes = 80;
      await this.publishJson('demo.js.limits.max-bytes', { id: 1, value: 'x'.repeat(payloadValueBytes) });
      await this.publishJson('demo.js.limits.max-bytes', { id: 2, value: 'y'.repeat(payloadValueBytes) });
      const beforeEviction = await this.streamService.getInfo(stream);
      await this.publishJson('demo.js.limits.max-bytes', { id: 3, value: 'z'.repeat(payloadValueBytes) });
      const afterEviction = await this.pollStream(stream, (info) =>
        info.state.bytes <= info.config.max_bytes && info.state.first_seq > 1,
      );
      const conditionSatisfied =
        afterEviction.state.bytes <= afterEviction.config.max_bytes &&
        afterEviction.state.first_seq > beforeEviction.state.first_seq;
      return this.evidence('limits-max-bytes', stream, {
        publishedCount: 3,
        payloadValueBytes,
        expectedEvictionCondition: 'afterEviction.bytes <= max_bytes and first_seq advances',
        configured: {
          max_msgs: afterEviction.config.max_msgs,
          max_age: afterEviction.config.max_age,
          max_bytes: afterEviction.config.max_bytes,
        },
        beforeEviction: this.stateSnapshot(beforeEviction),
        afterEviction: this.stateSnapshot(afterEviction),
        conditionSatisfied,
        evictedByBytes: conditionSatisfied,
      });
    }, [() => this.cleanupStream(stream)]);
  }

  async runMaxAgeLimitDemo(): Promise<JetStreamScenarioEvidence> {
    const stream = JetStreamDemoStream.LimitsMaxAge;
    await this.resetStream(stream, {
      ...this.baseStreamConfig(stream, ['demo.js.limits.max-age']),
      max_msgs: -1,
      max_bytes: -1,
      max_age: HALF_SECOND_IN_NANOS,
    });
    return this.withCleanup(async () => {
      await this.publishJson('demo.js.limits.max-age', { id: 1 });
      const beforeExpiry = await this.streamService.getInfo(stream);
      const startedAt = Date.now();
      const afterExpiry = await this.pollStream(stream, (info) => info.state.messages === 0, 4000);
      const elapsedMs = Date.now() - startedAt;
      return this.evidence('limits-max-age', stream, {
        publishedCount: 1,
        expectedBeforeMessages: 1,
        expectedAfterMessages: 0,
        pollIntervalMs: POLL_INTERVAL_MS,
        elapsedMs,
        conditionSatisfied: afterExpiry.state.messages === 0,
        configured: {
          max_msgs: afterExpiry.config.max_msgs,
          max_bytes: afterExpiry.config.max_bytes,
          max_age: afterExpiry.config.max_age,
        },
        beforeExpiry: this.stateSnapshot(beforeExpiry),
        afterExpiry: this.stateSnapshot(afterExpiry),
      });
    }, [() => this.cleanupStream(stream)]);
  }

  async runWorkQueueAckDemo(): Promise<JetStreamScenarioEvidence> {
    const stream = JetStreamDemoStream.WorkQueue;
    const consumer = JetStreamDemoConsumer.WorkQueueWorker;
    await this.resetStream(stream, {
      ...this.baseStreamConfig(stream, ['demo.js.workqueue.jobs']),
      retention: RetentionPolicy.Workqueue,
    });
    return this.withCleanup(async () => {
      await this.publishJson('demo.js.workqueue.jobs', { jobId: 'job-1' });
      const beforeAck = await this.streamService.getInfo(stream);
      await this.createConsumer(stream, consumer, {
        durable_name: consumer,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
      });
      const message = await this.nextMessage(stream, consumer);
      const ackConfirmed = message ? await message.ackAck({ timeout: ACK_TIMEOUT_MS }) : false;
      const afterAck = await this.pollStream(stream, (info) => info.state.messages === 0);
      return this.evidence('workqueue-ack', stream, {
        beforeAck: this.stateSnapshot(beforeAck),
        delivered: message ? this.messageSnapshot(message) : null,
        ackConfirmed,
        afterAck: this.stateSnapshot(afterAck),
      });
    }, [() => this.cleanupConsumer(stream, consumer), () => this.cleanupStream(stream)]);
  }

  async runInterestAckDemo(): Promise<JetStreamScenarioEvidence> {
    const stream = JetStreamDemoStream.Interest;
    await this.resetStream(stream, {
      ...this.baseStreamConfig(stream, ['demo.js.interest.events']),
      retention: RetentionPolicy.Interest,
    });
    return this.withCleanup(async () => {
      await this.createConsumer(stream, JetStreamDemoConsumer.InterestA, {
        durable_name: JetStreamDemoConsumer.InterestA,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
      });
      await this.createConsumer(stream, JetStreamDemoConsumer.InterestB, {
        durable_name: JetStreamDemoConsumer.InterestB,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
      });
      await this.publishJson('demo.js.interest.events', { eventId: 'event-1' });
      const beforeAck = await this.streamService.getInfo(stream);
      const messageA = await this.nextMessage(stream, JetStreamDemoConsumer.InterestA);
      const ackAConfirmed = messageA ? await messageA.ackAck({ timeout: ACK_TIMEOUT_MS }) : false;
      const afterOneAck = await this.pollStream(stream, (info) => info.state.messages === 1);
      const messageB = await this.nextMessage(stream, JetStreamDemoConsumer.InterestB);
      const ackBConfirmed = messageB ? await messageB.ackAck({ timeout: ACK_TIMEOUT_MS }) : false;
      const afterBothAck = await this.pollStream(stream, (info) => info.state.messages === 0);
      return this.evidence('interest-two-consumer-ack', stream, {
        beforeAck: this.stateSnapshot(beforeAck),
        consumerA: messageA ? this.messageSnapshot(messageA) : null,
        ackAConfirmed,
        afterOneAck: this.stateSnapshot(afterOneAck),
        consumerB: messageB ? this.messageSnapshot(messageB) : null,
        ackBConfirmed,
        afterBothAck: this.stateSnapshot(afterBothAck),
      });
    }, [
      () => this.cleanupConsumer(stream, JetStreamDemoConsumer.InterestA),
      () => this.cleanupConsumer(stream, JetStreamDemoConsumer.InterestB),
      () => this.cleanupStream(stream),
    ]);
  }

  private async withCleanup<T>(operation: () => Promise<T>, cleanups: Array<() => Promise<void>>): Promise<T> {
    let result: T;
    try {
      result = await operation();
    } catch (error) {
      const cleanupErrors = await this.runCleanups(cleanups);
      if (cleanupErrors.length > 0) {
        this.logCleanupFailures(error, cleanupErrors);
      }
      throw error;
    }

    const cleanupErrors = await this.runCleanups(cleanups);
    if (cleanupErrors.length > 0) {
      throw cleanupErrors[0];
    }
    return result;
  }

  private async runCleanups(cleanups: Array<() => Promise<void>>): Promise<unknown[]> {
    const cleanupErrors: unknown[] = [];
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    return cleanupErrors;
  }

  private logCleanupFailures(primaryError: unknown, cleanupErrors: unknown[]): void {
    for (const cleanupError of cleanupErrors) {
      this.logger.error(
        `[JETSTREAM CLEANUP] cleanup failed after primary error=${this.errorMessage(primaryError)}: ${this.errorMessage(cleanupError)}`,
      );
    }
  }

  private baseStreamConfig(
    name: JetStreamDemoStream,
    subjects: string[],
    storage: StreamConfig['storage'] = StorageType.File,
  ): Pick<StreamConfig, 'name'> & Partial<StreamConfig> {
    return {
      name,
      subjects,
      storage,
      retention: RetentionPolicy.Limits,
      max_consumers: -1,
      max_msgs: -1,
      max_bytes: -1,
      max_age: 0,
      max_msg_size: -1,
      num_replicas: 1,
    };
  }

  private async resetStream(
    name: JetStreamDemoStream,
    config: Pick<StreamConfig, 'name'> & Partial<StreamConfig>,
  ): Promise<void> {
    await this.cleanupStream(name);
    await this.streamService.create(config);
  }

  private async cleanupStream(name: string): Promise<void> {
    this.assertDemoStreamName(name);
    try {
      await this.streamService.delete(name);
      this.logger.log(`[JETSTREAM CLEANUP] deleted stream=${name}`);
    } catch (error) {
      if (!this.isNotFoundError(error, JetStreamApiCodes.StreamNotFound)) {
        throw error;
      }
      this.logger.debug?.(`[JETSTREAM CLEANUP] stream=${name} was already absent: ${this.errorMessage(error)}`);
    }
  }

  private async cleanupConsumer(stream: string, consumer: string): Promise<void> {
    this.assertDemoStreamName(stream);
    try {
      const manager = await this.jetStreamService.getManager();
      await manager.consumers.delete(stream, consumer);
      this.logger.log(`[JETSTREAM CLEANUP] deleted consumer=${consumer} stream=${stream}`);
    } catch (error) {
      if (!this.isNotFoundError(error, JetStreamApiCodes.ConsumerNotFound)) {
        throw error;
      }
      this.logger.debug?.(`[JETSTREAM CLEANUP] consumer=${consumer} stream=${stream} was already absent: ${this.errorMessage(error)}`);
    }
  }

  private async createConsumer(
    stream: string,
    consumer: string,
    config: Partial<ConsumerConfig>,
  ): Promise<unknown> {
    this.assertDemoStreamName(stream);
    const manager = await this.jetStreamService.getManager();
    return manager.consumers.add(stream, {
      ...config,
      name: consumer,
    });
  }

  private async nextMessage(stream: string, consumer: string): Promise<JsMsg | null> {
    const client = await this.jetStreamService.getClient();
    const pullConsumer = await client.consumers.get(stream, consumer);
    return pullConsumer.next({ expires: 1000 });
  }

  private async publishJson(subject: string, payload: object): Promise<void> {
    const client = await this.jetStreamService.getClient();
    const ack = await client.publish(
      subject,
      this.encoder.encode(JSON.stringify(payload)),
    );
    this.logger.log(`[JETSTREAM PUBLISH] subject=${subject} stream=${ack.stream} seq=${ack.seq}`);
  }

  private evidence(
    scenario: string,
    stream: string,
    evidence: Record<string, unknown>,
  ): JetStreamScenarioEvidence {
    return { scenario, stream, evidence };
  }

  private streamSnapshot(info: StreamInfo): Record<string, unknown> {
    return {
      name: info.config.name,
      subjects: info.config.subjects,
      retention: info.config.retention,
      storage: info.config.storage,
      max_msgs: info.config.max_msgs,
      max_bytes: info.config.max_bytes,
      max_age: info.config.max_age,
      state: this.stateSnapshot(info),
    };
  }

  private stateSnapshot(info: StreamInfo): Record<string, unknown> {
    return {
      messages: info.state.messages,
      bytes: info.state.bytes,
      first_seq: info.state.first_seq,
      last_seq: info.state.last_seq,
      consumer_count: info.state.consumer_count,
      num_subjects: info.state.num_subjects,
    };
  }

  private messageSnapshot(message: JsMsg): Record<string, unknown> {
    return {
      subject: message.subject,
      streamSequence: message.info.streamSequence,
      deliverySequence: message.info.deliverySequence,
    };
  }

  private assertDemoStreamName(name: string): void {
    if (!name.startsWith(JETSTREAM_DEMO_STREAM_PREFIX)) {
      throw new Error(`Refusing to clean up non-demo JetStream stream: ${name}`);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isNotFoundError(error: unknown, code: number): boolean {
    return error instanceof JetStreamApiError && error.code === code;
  }

  private async pollStream(
    stream: string,
    predicate: (info: StreamInfo) => boolean,
    timeoutMs = 2000,
  ): Promise<StreamInfo> {
    const deadline = Date.now() + timeoutMs;
    let info = await this.streamService.getInfo(stream);
    while (!predicate(info) && Date.now() < deadline) {
      await this.delay(POLL_INTERVAL_MS);
      info = await this.streamService.getInfo(stream);
    }
    if (!predicate(info)) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for JetStream stream=${stream} to satisfy condition. Last state=${JSON.stringify(this.stateSnapshot(info))}`,
      );
    }
    return info;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
