import { Injectable, Logger } from '@nestjs/common';
import type { Msg, Subscription } from '@nats-io/transport-node';
import { DEFAULT_CORE_NATS_REQUEST_TIMEOUT_MS } from '@shared/constants/nats.constants';
import type {
  CoreNatsMessageHandler,
  CoreNatsRequestOptions,
  CoreNatsSubscribeOptions,
  CoreNatsSubscription,
} from '@shared/interfaces/nats/core-nats.types';
import { NatsService } from '../nats.service';
import { JsonNatsCodec } from './json-nats.codec';

@Injectable()
export class CoreNatsService {
  private readonly logger = new Logger(CoreNatsService.name);
  private readonly codec = new JsonNatsCodec();

  constructor(private readonly natsService: NatsService) {}

  /** Publishes one JSON payload to one fully specified Core NATS subject. */
  publish<TPayload>(subject: string, payload: TPayload): void {
    // Reuse the centralized app connection and codec; this method must not create connections.
    this.natsService.connection.publish(subject, this.codec.encode(payload));
  }

  /**
   * Sends one JSON request and waits for a responder reply until the timeout.
   * Delegates to the native request() and lets native failures propagate
   * unchanged (e.g. TimeoutError, RequestError with a NoRespondersError cause).
   */
  async request<TRequest, TResponse>(
    subject: string,
    payload: TRequest,
    options: CoreNatsRequestOptions = {},
  ): Promise<TResponse> {
    const timeoutMs =
      options.timeout ?? DEFAULT_CORE_NATS_REQUEST_TIMEOUT_MS;
    const encoded = this.codec.encode(payload);
    const message = await this.natsService.connection.request(subject, encoded, {
      timeout: timeoutMs,
    });
    return this.codec.decode(message.data) as TResponse;
  }

  /** Flushes the shared NATS connection to synchronize with the server. */
  async flush(): Promise<void> {
    // Expose native flush so tests/demos can deterministically wait for subscriptions and publishes.
    await this.natsService.connection.flush();
  }

  /** Creates a Core NATS subscription and returns a cleanup-capable handle. */
  subscribe<TPayload>(
    subject: string,
    handler: CoreNatsMessageHandler<TPayload>,
    options: CoreNatsSubscribeOptions = {},
  ): CoreNatsSubscription {
    // Call flush() after subscribing when the next step depends on server-side
    // interest registration (for example, deterministic tests or demos).
    const subscription = this.natsService.connection.subscribe(subject, {
      queue: options.queue,
      callback: (error: Error | null, message: Msg): void => {
        if (error) {
          // Surface infrastructure subscription errors without converting them into business logic.
          this.logger.error(
            `Core NATS subscription error on subject=${subject}: ${error.message}`,
            error.stack,
          );
          return;
        }

        // Process message asynchronously so the native callback remains small and focused.
        void this.handleMessage(subject, message, handler);
      },
    });

    // Return a wrapper instead of the bare subscription so callers get a stable app-level type.
    return this.toCoreSubscription(subject, subscription, options);
  }

  /** Decodes one native NATS message and invokes the application handler. */
  private async handleMessage<TPayload>(
    subscriptionSubject: string,
    message: Msg,
    handler: CoreNatsMessageHandler<TPayload>,
  ): Promise<void> {
    try {
      // Decode here so handlers receive typed payloads plus the actual matched subject.
      const payload = this.codec.decode(message.data) as TPayload;
      await handler({
        subscriptionSubject,
        subject: message.subject,
        payload,
        reply: message.reply,
        // Respond() re-encodes through the shared codec and delegates to the native reply inbox.
        respond: <TResponse>(response: TResponse): boolean =>
          message.respond(this.codec.encode(response)),
      });
    } catch (error) {
      // Normalize unknown thrown values so Nest Logger always receives a useful message/stack.
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Core NATS message handler failed for subscription=${subscriptionSubject} actualSubject=${message.subject}: ${normalizedError.message}`,
        normalizedError.stack,
      );
    }
  }

  /** Adapts the native NATS subscription to the shared CoreNatsSubscription contract. */
  private toCoreSubscription(
    subject: string,
    nativeSubscription: Subscription,
    options: CoreNatsSubscribeOptions,
  ): CoreNatsSubscription {
    // Delegate lifecycle methods directly to NATS.js so unsubscribe/drain semantics stay native.
    return {
      subject,
      queue: options.queue,
      nativeSubscription,
      closed: nativeSubscription.closed,
      unsubscribe: (max?: number): void => nativeSubscription.unsubscribe(max),
      drain: (): Promise<void> => nativeSubscription.drain(),
      isClosed: (): boolean => nativeSubscription.isClosed(),
      isDraining: (): boolean => nativeSubscription.isDraining(),
      getReceived: (): number => nativeSubscription.getReceived(),
      getProcessed: (): number => nativeSubscription.getProcessed(),
    };
  }
}
