import type { CoreNatsMessage } from './core-nats.types';
import type { DemoOrderPayload, DemoTextPayload } from '../demos/core-nats-demo.types';

export type TestOrderPayload = DemoOrderPayload;

export type TestTextPayload = DemoTextPayload;

export interface MessageCollector<TPayload> {
  readonly messages: Array<CoreNatsMessage<TPayload>>;
  readonly handler: (message: CoreNatsMessage<TPayload>) => void;
  waitForCount(count: number): Promise<Array<CoreNatsMessage<TPayload>>>;
}
