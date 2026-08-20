export const JETSTREAM_DEMO_STREAM_PREFIX = 'DEMO_JS_';

export enum JetStreamDemoStream {
  Crud = 'DEMO_JS_CRUD',
  Hierarchy = 'DEMO_JS_HIERARCHY',
  File = 'DEMO_JS_FILE',
  Memory = 'DEMO_JS_MEMORY',
  Limits = 'DEMO_JS_LIMITS',
  LimitsMaxMessages = 'DEMO_JS_LIMITS_MAX_MSGS',
  LimitsMaxBytes = 'DEMO_JS_LIMITS_MAX_BYTES',
  LimitsMaxAge = 'DEMO_JS_LIMITS_MAX_AGE',
  WorkQueue = 'DEMO_JS_WORKQUEUE',
  Interest = 'DEMO_JS_INTEREST',
}

export enum JetStreamDemoConsumer {
  WorkQueueWorker = 'demo_wq_worker',
  InterestA = 'demo_interest_a',
  InterestB = 'demo_interest_b',
}
