import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { RequestError, TimeoutError } from "@nats-io/transport-node";
import { CoreNatsService } from "@infrastructure/nats/core/core-nats.service";
import {
  CoreNatsDemoFanOutSubscriber,
  CoreNatsDemoQueueGroup,
  CoreNatsDemoQueueWorker,
  CoreNatsDemoSubject,
} from "@shared/constants/core-nats-demo.constants";
import type {
  CoreNatsMessage,
  CoreNatsSubscription,
} from "@shared/interfaces/nats/core-nats.types";
import type {
  DemoJobPayload,
  DemoOrderPayload,
  DemoTextPayload,
  DemoUserGetRequest,
  DemoUserResponse,
} from "@shared/interfaces/demos/core-nats-demo.types";

@Injectable()
export class CoreNatsDemoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CoreNatsDemoService.name);
  private readonly subscriptions: CoreNatsSubscription[] = [];

  constructor(private readonly coreNatsService: CoreNatsService) {}

  /** Registers the request/reply responders when the application starts. */
  async onModuleInit(): Promise<void> {
    try {
      this.subscriptions.push(
        this.coreNatsService.subscribe<DemoUserGetRequest>(
          CoreNatsDemoSubject.UsersGet,
          (message) => this.handleGetUser(message),
        ),
        this.coreNatsService.subscribe<{ ping: boolean }>(
          CoreNatsDemoSubject.RpcSlow,
          async (message) => {
            await this.delay(1500);
            message.respond?.({ pong: true });
          },
        ),
      );
      // Flush so server-side interest is registered before any HTTP request arrives.
      await this.coreNatsService.flush();
    } catch (error) {
      // Keep the app alive when NATS is unavailable; requests will surface no-responders/timeout instead.
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to start Core NATS responder subscriptions: ${normalizedError.message}`,
        normalizedError.stack,
      );
    }
  }


  /** Fetches a user through the Core NATS request/reply RPC demo. */
  async getUser(userId: string): Promise<DemoUserResponse> {
    this.logger.log(`[REQUEST] subject=${CoreNatsDemoSubject.UsersGet}`);
    const response = await this.coreNatsService.request<
      DemoUserGetRequest,
      DemoUserResponse
    >(CoreNatsDemoSubject.UsersGet, { userId });
    this.logger.log(`[RESPONSE] subject=${CoreNatsDemoSubject.UsersGet}`);
    return response;
  }

  /** Triggers a request that outlives the requester timeout on purpose. */
  async triggerTimeout(): Promise<void> {
    try {
      await this.coreNatsService.request(
        CoreNatsDemoSubject.RpcSlow,
        { ping: true },
        { timeout: 500 },
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new HttpException(
          {
            status: "error",
            error: "TIMEOUT",
            message: error.message,
            subject: CoreNatsDemoSubject.RpcSlow,
          },
          HttpStatus.REQUEST_TIMEOUT,
        );
      }
      throw error;
    }
  }

  /** Triggers a request to a subject with no active responder on purpose. */
  async triggerNoResponder(): Promise<void> {
    try {
      await this.coreNatsService.request(
        CoreNatsDemoSubject.RpcNoResponder,
        { ping: true },
        { timeout: 1000 },
      );
    } catch (error) {
      if (error instanceof RequestError && error.isNoResponders()) {
        throw new HttpException(
          {
            status: "error",
            error: "NO_RESPONDERS",
            message: error.message,
            subject: CoreNatsDemoSubject.RpcNoResponder,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }

  /** Demonstrates that an exact Core NATS subject only receives the same subject. */
  async runExactSubjectDemo(): Promise<void> {
    const subscription = this.coreNatsService.subscribe<DemoOrderPayload>(
      CoreNatsDemoSubject.OrdersCreated,
      (message) => this.logReceived(message),
    );

    await this.runLiveSubscriptionDemo([subscription], () => {
      // Only the exact created subject should be received by this subscription.
      this.publishOrder(CoreNatsDemoSubject.OrdersCreated, "created");
      this.publishOrder(CoreNatsDemoSubject.OrdersUpdated, "updated");
      this.publishOrder(CoreNatsDemoSubject.OrdersCreated, "otherCreated");
    });
  }

  /** Demonstrates that `*` matches exactly one subject token. */
  async runStarWildcardDemo(): Promise<void> {
    const subscription = this.coreNatsService.subscribe<DemoOrderPayload>(
      CoreNatsDemoSubject.OrdersOneTokenWildcard,
      (message) => this.logReceived(message),
    );

    await this.runLiveSubscriptionDemo([subscription], () => {
      // The payment.completed subject has two trailing tokens and should not match `*`.
      this.publishOrder(CoreNatsDemoSubject.OrdersCreated, "created");
      this.publishOrder(CoreNatsDemoSubject.OrdersUpdated, "updated");
      this.publishOrder(CoreNatsDemoSubject.OrdersCancelled, "cancelled");
      this.publishOrder(
        CoreNatsDemoSubject.OrdersPaymentCompleted,
        "payment-completed",
      );
    });
  }

  /** Demonstrates that `>` matches the remaining subject hierarchy. */
  async runGreaterThanWildcardDemo(): Promise<void> {
    const subscription = this.coreNatsService.subscribe<DemoOrderPayload>(
      CoreNatsDemoSubject.OrdersAllWildcard,
      (message) => this.logReceived(message),
    );

    await this.runLiveSubscriptionDemo([subscription], () => {
      // Publish both shallow and nested subjects so `>` behavior is obvious.
      this.publishOrder(CoreNatsDemoSubject.OrdersCreated, "created");
      this.publishOrder(CoreNatsDemoSubject.OrdersUpdated, "updated");
      this.publishOrder(
        CoreNatsDemoSubject.OrdersPaymentCompleted,
        "payment-completed",
      );
    });
  }

  /** Demonstrates Core NATS fan-out to three independent subscribers. */
  async runFanOutDemo(): Promise<void> {
    const subscribers = Object.values(CoreNatsDemoFanOutSubscriber).map(
      (subscriber) =>
        this.coreNatsService.subscribe<DemoOrderPayload>(
          CoreNatsDemoSubject.JobsFanout,
          (message) => this.logReceived(message, subscriber),
        ),
    );

    await this.runLiveSubscriptionDemo(subscribers, () => {
      // Normal Core NATS subscribers are independent: this one message fans out to A, B, and C.
      this.publishOrder(CoreNatsDemoSubject.JobsFanout, "fanout");
    });
  }

  /** Demonstrates Core NATS queue-group load balancing with one job message. */
  async runQueueGroupJobDemo(payload: DemoJobPayload): Promise<void> {
    const workers = this.createQueueGroupWorkers();

    await this.runLiveSubscriptionDemo(workers, () => {
      this.publishJob(payload.jobId);
    });
  }

  /** Demonstrates Core NATS queue-group load balancing across several job messages. */
  async runQueueGroupBatchDemo(count: number): Promise<void> {
    const workers = this.createQueueGroupWorkers();

    await this.runLiveSubscriptionDemo(workers, () => {
      for (let index = 1; index <= count; index += 1) {
        this.publishJob(`job-${index}`);
      }
    });
  }

  /** Demonstrates Core NATS at-most-once behavior for offline subscribers. */
  async runAtMostOnceDemo(): Promise<void> {
    const firstSubscription = this.coreNatsService.subscribe<DemoTextPayload>(
      CoreNatsDemoSubject.AtMostOnce,
      (message) => this.logReceived(message),
    );

    try {
      await this.coreNatsService.flush();
      this.publishText(CoreNatsDemoSubject.AtMostOnce, "message-1");
      await this.coreNatsService.flush();
    } finally {
      // Stop and wait for closure so no subscriber is interested in message-2.
      firstSubscription.unsubscribe();
      await firstSubscription.closed;
    }

    // message-2 is intentionally published with no active subscriber and will not be replayed.
    this.publishText(CoreNatsDemoSubject.AtMostOnce, "message-2");
    await this.coreNatsService.flush();

    const secondSubscription = this.coreNatsService.subscribe<DemoTextPayload>(
      CoreNatsDemoSubject.AtMostOnce,
      (message) => this.logReceived(message),
    );

    await this.runLiveSubscriptionDemo([secondSubscription], () => {
      // message-3 proves delivery resumes for new live messages only.
      this.publishText(CoreNatsDemoSubject.AtMostOnce, "message-3");
    });
  }

  /** Publishes the reusable demo order payload shape to the supplied subject. */
  private publishOrder(subject: string, status: string): void {
    // Keep payload construction in one helper so all demos use the same simple message shape.
    const payload: DemoOrderPayload = { orderId: "order-100", status };
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

  /** Publishes a queue-group demo job to the shared demo subject. */
  private publishJob(jobId: string): void {
    const payload: DemoJobPayload = { jobId };
    this.logPublish(CoreNatsDemoSubject.JobsProcess, payload);
    this.coreNatsService.publish(CoreNatsDemoSubject.JobsProcess, payload);
  }

  /** Registers Worker A/B/C in the same Core NATS queue group. */
  private createQueueGroupWorkers(): CoreNatsSubscription[] {
    return Object.values(CoreNatsDemoQueueWorker).map((worker) =>
      this.coreNatsService.subscribe<DemoJobPayload>(
        CoreNatsDemoSubject.JobsProcess,
        (message) => this.logQueueWorkerReceived(worker, message),
        { queue: CoreNatsDemoQueueGroup.DemoWorkers },
      ),
    );
  }

  /** Runs the standard live Core NATS demo lifecycle and always cleans up subscriptions. */
  private async runLiveSubscriptionDemo(
    subscriptions: CoreNatsSubscription[],
    publishMessages: () => void | Promise<void>,
  ): Promise<void> {
    try {
      // Core NATS only delivers live messages; flush before publishing to register interest first.
      await this.coreNatsService.flush();
      await publishMessages();
      // Flush after publishing so demo logs are visible before subscriptions are cleaned up.
      await this.coreNatsService.flush();
    } finally {
      this.unsubscribeAll(subscriptions);
    }
  }

  /** Cleans up demo subscriptions using the same lifecycle wrapper as other Core NATS demos. */
  private unsubscribeAll(subscriptions: CoreNatsSubscription[]): void {
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
  }

  /** Logs every demo publish with the subject and JSON payload. */
  private logPublish(
    subject: string,
    payload: DemoOrderPayload | DemoTextPayload | DemoJobPayload,
  ): void {
    // Use the requested format so published subjects are easy to compare with received subjects.
    this.logger.log(
      `[PUBLISH] subject=${subject} payload=${JSON.stringify(payload)}`,
    );
  }

  /** Logs every demo receive with subscription subject and actual delivered subject. */
  private logReceived<TPayload>(
    message: CoreNatsMessage<TPayload>,
    label?: string,
  ): void {
    // Include the actual subject because wildcard subscriptions can match multiple concrete subjects.
    const subscriberLabel = label ? ` subscriber=${label}` : "";
    this.logger.log(
      `[RECEIVED]${subscriberLabel} subscription=${message.subscriptionSubject} actualSubject=${message.subject} payload=${JSON.stringify(message.payload)}`,
    );
  }

  /** Logs queue-group worker delivery without implying strict round-robin ordering. */
  private logQueueWorkerReceived<TPayload>(
    worker: string,
    message: CoreNatsMessage<TPayload>,
  ): void {
    this.logger.log(
      `[QUEUE WORKER] worker=${worker} subject=${message.subject} queue=${CoreNatsDemoQueueGroup.DemoWorkers} payload=${JSON.stringify(message.payload)}`,
    );
  }

  /** Handles demo.users.get by replying with a demo user and logging the reply inbox. */
  private handleGetUser(message: CoreNatsMessage<DemoUserGetRequest>): void {
    this.logger.log(
      `[REQUEST RECEIVED] subject=${message.subject} reply=${message.reply ?? "none"}`,
    );
    const response: DemoUserResponse = {
      id: message.payload.userId,
      name: "Demo User",
    };
    message.respond?.(response);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  /** Cleans up responder subscriptions on shutdown. */
  onModuleDestroy(): void {
    this.unsubscribeAll(this.subscriptions);
  }
}
