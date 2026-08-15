// Shared DI token used to inject resolved NATS configuration into NatsService.
export const NATS_OPTIONS = Symbol('NATS_OPTIONS');

// Default timeout applied to Core NATS request/reply calls when no explicit timeout is provided.
export const DEFAULT_CORE_NATS_REQUEST_TIMEOUT_MS = 2000;
