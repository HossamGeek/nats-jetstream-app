// Shared DI token used to inject resolved NATS configuration into NatsService.
// Keeping the token in shared/constants avoids coupling consumers to the
// infrastructure folder structure.
export const NATS_OPTIONS = Symbol('NATS_OPTIONS');
