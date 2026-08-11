import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CoreNatsService } from '../../../src/infrastructure/nats/core/core-nats.service';
import { NatsModule } from '../../../src/infrastructure/nats/nats.module';
import type {
  CoreNatsSubscription,
} from '../../../src/shared/interfaces/nats/core-nats.types';
import type {
  MessageCollector,
  TestOrderPayload,
  TestTextPayload,
} from '../../../src/shared/interfaces/nats/core-nats-test.types';

const createCollector = <TPayload>(): MessageCollector<TPayload> => {
  const messages: MessageCollector<TPayload>['messages'] = [];
  const waiters: Array<{
    count: number;
    resolve: (messages: MessageCollector<TPayload>['messages']) => void;
  }> = [];

  const notifyWaiters = (): void => {
    for (const waiter of waiters) {
      if (messages.length >= waiter.count) {
        waiter.resolve(messages);
      }
    }
  };

  return {
    messages,
    handler: (message): void => {
      messages.push(message);
      notifyWaiters();
    },
    waitForCount: (count): Promise<MessageCollector<TPayload>['messages']> => {
      if (messages.length >= count) {
        return Promise.resolve(messages);
      }

      return new Promise((resolve) => {
        waiters.push({ count, resolve });
      });
    },
  };
};

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 1000);
    }),
  ]);

describe('CoreNatsService integration', () => {
  let moduleRef: TestingModule;
  let coreNatsService: CoreNatsService;
  const activeSubscriptions: CoreNatsSubscription[] = [];
  const subjectPrefix = `test.core.${Date.now()}.${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    jest.setTimeout(15000);
    process.env.NATS_SERVERS = process.env.NATS_SERVERS ?? 'nats://localhost:4222';
    process.env.NATS_FAIL_ON_STARTUP = 'true';

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.local', '.env'],
        }),
        NatsModule,
      ],
    }).compile();

    await moduleRef.init();
    coreNatsService = moduleRef.get(CoreNatsService);
  });

  afterEach(async () => {
    const subscriptions = activeSubscriptions.splice(0);
    for (const subscription of subscriptions) {
      if (!subscription.isClosed() && !subscription.isDraining()) {
        subscription.unsubscribe();
      }
      await subscription.closed;
    }
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const track = (subscription: CoreNatsSubscription): CoreNatsSubscription => {
    activeSubscriptions.push(subscription);
    return subscription;
  };

  const payload = (status: string): TestOrderPayload => ({
    orderId: 'order-100',
    status,
  });

  it('exact subject receives matching message', async () => {
    const collector = createCollector<TestOrderPayload>();
    track(coreNatsService.subscribe(`${subjectPrefix}.orders.created`, collector.handler));
    await coreNatsService.flush();

    coreNatsService.publish(`${subjectPrefix}.orders.created`, payload('created'));
    await coreNatsService.flush();

    await withTimeout(collector.waitForCount(1), 'exact subject message');
    expect(collector.messages).toHaveLength(1);
    expect(collector.messages[0]).toMatchObject({
      subscriptionSubject: `${subjectPrefix}.orders.created`,
      subject: `${subjectPrefix}.orders.created`,
      payload: payload('created'),
    });
  });

  it('exact subject does not receive unrelated message', async () => {
    const collector = createCollector<TestOrderPayload>();
    track(coreNatsService.subscribe(`${subjectPrefix}.orders.created`, collector.handler));
    await coreNatsService.flush();

    coreNatsService.publish(`${subjectPrefix}.orders.updated`, payload('updated'));
    await coreNatsService.flush();

    expect(collector.messages).toHaveLength(0);
  });

  it('"*" matches exactly one token', async () => {
    const collector = createCollector<TestOrderPayload>();
    track(coreNatsService.subscribe(`${subjectPrefix}.orders.*`, collector.handler));
    await coreNatsService.flush();

    coreNatsService.publish(`${subjectPrefix}.orders.created`, payload('created'));
    coreNatsService.publish(`${subjectPrefix}.orders.updated`, payload('updated'));
    coreNatsService.publish(`${subjectPrefix}.orders.cancelled`, payload('cancelled'));
    await coreNatsService.flush();

    await withTimeout(collector.waitForCount(3), 'single-token wildcard messages');
    expect(collector.messages.map((message) => message.subject)).toEqual([
      `${subjectPrefix}.orders.created`,
      `${subjectPrefix}.orders.updated`,
      `${subjectPrefix}.orders.cancelled`,
    ]);
  });

  it('"*" does not match multiple trailing tokens', async () => {
    const collector = createCollector<TestOrderPayload>();
    track(coreNatsService.subscribe(`${subjectPrefix}.orders.*`, collector.handler));
    await coreNatsService.flush();

    coreNatsService.publish(
      `${subjectPrefix}.orders.payment.completed`,
      payload('payment-completed'),
    );
    await coreNatsService.flush();

    expect(collector.messages).toHaveLength(0);
  });

  it('">" matches nested subjects', async () => {
    const collector = createCollector<TestOrderPayload>();
    track(coreNatsService.subscribe(`${subjectPrefix}.orders.>`, collector.handler));
    await coreNatsService.flush();

    coreNatsService.publish(`${subjectPrefix}.orders.created`, payload('created'));
    coreNatsService.publish(
      `${subjectPrefix}.orders.payment.completed`,
      payload('payment-completed'),
    );
    await coreNatsService.flush();

    await withTimeout(collector.waitForCount(2), 'greater-than wildcard messages');
    expect(collector.messages.map((message) => message.subject)).toEqual([
      `${subjectPrefix}.orders.created`,
      `${subjectPrefix}.orders.payment.completed`,
    ]);
  });

  it('two independent subscribers receive the same message', async () => {
    const collectorA = createCollector<TestOrderPayload>();
    const collectorB = createCollector<TestOrderPayload>();
    track(coreNatsService.subscribe(`${subjectPrefix}.fanout.created`, collectorA.handler));
    track(coreNatsService.subscribe(`${subjectPrefix}.fanout.created`, collectorB.handler));
    await coreNatsService.flush();

    coreNatsService.publish(`${subjectPrefix}.fanout.created`, payload('created'));
    await coreNatsService.flush();

    await Promise.all([
      withTimeout(collectorA.waitForCount(1), 'subscriber A fan-out message'),
      withTimeout(collectorB.waitForCount(1), 'subscriber B fan-out message'),
    ]);
    expect(collectorA.messages).toHaveLength(1);
    expect(collectorB.messages).toHaveLength(1);
  });

  it('subscriber created after a Core NATS publish does not receive that previous message', async () => {
    const subject = `${subjectPrefix}.at-most-once`;
    const firstCollector = createCollector<TestTextPayload>();
    const firstSubscription = track(coreNatsService.subscribe(subject, firstCollector.handler));
    await coreNatsService.flush();

    coreNatsService.publish(subject, { value: 'message-1' });
    await coreNatsService.flush();
    await withTimeout(firstCollector.waitForCount(1), 'message-1');

    firstSubscription.unsubscribe();
    await firstSubscription.closed;
    activeSubscriptions.splice(activeSubscriptions.indexOf(firstSubscription), 1);

    coreNatsService.publish(subject, { value: 'message-2' });
    await coreNatsService.flush();

    const secondCollector = createCollector<TestTextPayload>();
    track(coreNatsService.subscribe(subject, secondCollector.handler));
    await coreNatsService.flush();
    expect(secondCollector.messages).toHaveLength(0);

    coreNatsService.publish(subject, { value: 'message-3' });
    await coreNatsService.flush();
    await withTimeout(secondCollector.waitForCount(1), 'message-3');

    expect(firstCollector.messages.map((message) => message.payload.value)).toEqual(['message-1']);
    expect(secondCollector.messages.map((message) => message.payload.value)).toEqual(['message-3']);
  });
});
