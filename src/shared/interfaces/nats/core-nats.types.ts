import type { Subscription } from '@nats-io/transport-node';

export interface CoreNatsMessage<TPayload> {
  /** The subject pattern used to create the subscription, e.g. demo.orders.*. */
  subscriptionSubject: string;
  /** The concrete subject that delivered this message, e.g. demo.orders.created. */
  subject: string;
  /** JSON-decoded payload published on the subject. */
  payload: TPayload;
}

export type CoreNatsMessageHandler<TPayload> = (
  message: CoreNatsMessage<TPayload>,
) => void | Promise<void>;

export interface CoreNatsSubscription {
  /** The subject pattern used to create the subscription. */
  readonly subject: string;
  /** Native NATS subscription for callers that need low-level lifecycle details. */
  readonly nativeSubscription: Subscription;
  /** Resolves when the native subscription closes. */
  readonly closed: Promise<void | Error>;
  /** Stop receiving messages immediately, or after max messages if provided. */
  unsubscribe(max?: number): void;
  /** Drain pending in-flight messages and then close the subscription. */
  drain(): Promise<void>;
  /** Check native closed state without reaching into infrastructure internals. */
  isClosed(): boolean;
  /** Check native draining state before attempting duplicate cleanup. */
  isDraining(): boolean;
  /** Expose the native received count for demos/tests that prove delivery. */
  getReceived(): number;
  /** Expose the native processed count for lifecycle/debug observations. */
  getProcessed(): number;
}
