export interface NatsHealthDetail {
  status: 'up' | 'down';
  message?: string;
}

export interface HealthCheckResult {
  status: 'ok' | 'error';
  info: Record<string, NatsHealthDetail>;
  error: Record<string, NatsHealthDetail>;
  details: Record<string, NatsHealthDetail>;
}
