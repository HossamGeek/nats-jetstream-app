import { Injectable, Logger } from '@nestjs/common';
import { CoreNatsService } from '@infrastructure/nats/core/core-nats.service';
import type { CoreNatsMessage } from '@shared/interfaces/nats/core-nats.types';
import type {
  CoreNatsDemoRunResponse,
  DemoOrderPayload,
  DemoTextPayload,
} from '@shared/interfaces/demos/core-nats-demo.types';

@Injectable()
export class CoreNatsDemoService {
  private readonly logger = new Logger(CoreNatsDemoService.name);

  constructor(private readonly coreNatsService: CoreNatsService) {}

  /** Demonstrates that an exact Core NATS subject only receives the same subject. */
  async runExactSubjectDemo(): Promise<void> {
    // Create the subscriber first because Core NATS only delivers live messages to active interest.
    const subscription = this.coreNatsService.subscribe<DemoOrderPayload>(
      'demo.orders.created',
      (message) => this.logReceived(message),
    );
    // Flush makes the subscription registration deterministic before publishing demo messages.
    await this.coreNatsService.flush();

    // Publish one matching subject and one unrelated subject so the difference is visible in logs.
    this.publishOrder('demo.orders.created', 'created');
    this.publishOrder('demo.orders.updated', 'updated');
        this.publishOrder('demo.orders.created', 'otherCreated');
    await this.coreNatsService.flush();
    // Stop the demo subscription so it does not leak into later scenarios.
    subscription.unsubscribe();
  }

  /** Demonstrates that `*` matches exactly one subject token. */
  async runStarWildcardDemo(): Promise<void> {
    // Subscribe to a one-token wildcard to show created/updated/cancelled match.
    const subscription = this.coreNatsService.subscribe<DemoOrderPayload>(
      'demo.orders.*',
      (message) => this.logReceived(message),
    );
    await this.coreNatsService.flush();

    // The payment.completed subject intentionally has two trailing tokens and should not match `*`.
    this.publishOrder('demo.orders.created', 'created');
    this.publishOrder('demo.orders.updated', 'updated');
    this.publishOrder('demo.orders.cancelled', 'cancelled');
    this.publishOrder('demo.orders.payment.completed', 'payment-completed');
    await this.coreNatsService.flush();
    subscription.unsubscribe();
  }

  /** Demonstrates that `>` matches the remaining subject hierarchy. */
  async runGreaterThanWildcardDemo(): Promise<void> {
    // The greater-than wildcard is final and receives all subjects under demo.orders.
    const subscription = this.coreNatsService.subscribe<DemoOrderPayload>(
      'demo.orders.>',
      (message) => this.logReceived(message),
    );
    await this.coreNatsService.flush();

    // Publish both shallow and nested subjects so `>` behavior is obvious.
    this.publishOrder('demo.orders.created', 'created');
    this.publishOrder('demo.orders.updated', 'updated');
    this.publishOrder('demo.orders.payment.completed', 'payment-completed');
    await this.coreNatsService.flush();
    subscription.unsubscribe();
  }

  /** Demonstrates Core NATS fan-out to two independent subscribers. */
  async runFanOutDemo(): Promise<void> {
    // Create two separate subscriptions without a queue group so both receive the same message.
    const subscriberA = this.coreNatsService.subscribe<DemoOrderPayload>(
      'demo.orders.created',
      (message) => this.logReceived(message, 'Subscriber A'),
    );
    const subscriberB = this.coreNatsService.subscribe<DemoOrderPayload>(
      'demo.orders.created',
      (message) => this.logReceived(message, 'Subscriber B'),
    );
    await this.coreNatsService.flush();

    // One publish fans out to both independent subscriptions.
    this.publishOrder('demo.orders.created', 'created');
    await this.coreNatsService.flush();
    subscriberA.unsubscribe();
    subscriberB.unsubscribe();
  }

  /** Demonstrates Core NATS at-most-once behavior for offline subscribers. */
  async runAtMostOnceDemo(): Promise<void> {
    // Start with an active subscriber so message-1 is delivered live.
    const firstSubscription = this.coreNatsService.subscribe<DemoTextPayload>(
      'demo.at-most-once',
      (message) => this.logReceived(message),
    );
    await this.coreNatsService.flush();

    // message-1 proves normal live delivery while a subscriber is active.
    this.publishText('demo.at-most-once', 'message-1');
    await this.coreNatsService.flush();
    // Stop and wait for closure so no subscriber is interested in message-2.
    firstSubscription.unsubscribe();
    await firstSubscription.closed;

    // message-2 is intentionally published with no active subscriber and will not be replayed.
    this.publishText('demo.at-most-once', 'message-2');
    await this.coreNatsService.flush();

    // Recreate the subscriber after message-2 to show Core NATS did not store it.
    const secondSubscription = this.coreNatsService.subscribe<DemoTextPayload>(
      'demo.at-most-once',
      (message) => this.logReceived(message),
    );
    await this.coreNatsService.flush();

    // message-3 proves delivery resumes for new live messages only.
    this.publishText('demo.at-most-once', 'message-3');
    await this.coreNatsService.flush();
    secondSubscription.unsubscribe();
  }

  /** Builds a consistent HTTP/demo response after a scenario finishes. */
  createResponse(demo: string, observation: string): CoreNatsDemoRunResponse {
    // Response construction belongs here because the service owns demo orchestration results.
    return {
      demo,
      status: 'started-and-finished',
      observation,
    };
  }

  /** Publishes the reusable demo order payload shape to the supplied subject. */
  private publishOrder(subject: string, status: string): void {
    // Keep payload construction in one helper so all demos use the same simple message shape.
    const payload: DemoOrderPayload = { orderId: 'order-100', status };
    this.logPublish(subject, payload);
    this.coreNatsService.publish(subject, payload);
  }

  /** Publishes a text payload for the at-most-once scenario. */
  private publishText(subject: string, value: string): void {
    // Text payloads make message-1/message-2/message-3 observations easy to read.
    const payload: DemoTextPayload = { value };
    this.logPublish(subject, payload);
    this.coreNatsService.publish(subject, payload);
  }

  /** Logs every demo publish with the subject and JSON payload. */
  private logPublish(subject: string, payload: DemoOrderPayload | DemoTextPayload): void {
    // Use the requested format so published subjects are easy to compare with received subjects.
    this.logger.log(`[PUBLISH] subject=${subject} payload=${JSON.stringify(payload)}`);
  }

  /** Logs every demo receive with subscription subject and actual delivered subject. */
  private logReceived<TPayload>(message: CoreNatsMessage<TPayload>, label?: string): void {
    // Include the actual subject because wildcard subscriptions can match multiple concrete subjects.
    const subscriberLabel = label ? ` subscriber=${label}` : '';
    this.logger.log(
      `[RECEIVED]${subscriberLabel} subscription=${message.subscriptionSubject} actualSubject=${message.subject} payload=${JSON.stringify(message.payload)}`,
    );
  }
}
