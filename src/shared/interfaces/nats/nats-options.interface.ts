// Runtime options needed to create the official NATS.js Node connection.
export interface NatsModuleOptions {
  /** NATS server URL(s), e.g. `nats://localhost:4222`. Multiple servers are tried in order for cluster/failover. */
  servers: string[];
  /** Client name reported to the NATS server (shows up in `nats server report`). */
  connectionName?: string;
  /** Connection timeout in milliseconds. */
  timeout?: number;
  /** When `true`, application startup fails if NATS is unreachable. */
  failOnStartup?: boolean;
}
