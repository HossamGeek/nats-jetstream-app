// Response types for the health endpoint, kept outside the controller so the
// HTTP contract can be shared with tests and future consumers.

export interface NatsHealthDetail {
  // Kept deliberately small: this task only needs up/down state plus an optional error.
  status: 'up' | 'down';
  message?: string;
}

export interface HealthCheckResult {
  // Mirrors the common health-check response shape without adding a full subsystem.
  status: 'ok' | 'error';
  info: Record<string, NatsHealthDetail>;
  error: Record<string, NatsHealthDetail>;
  details: Record<string, NatsHealthDetail>;
}
