import { registerAs } from '@nestjs/config';
import type { NatsModuleOptions } from '../interfaces/nats/nats-options.interface';

/** Default NATS server URL used when NATS_SERVERS is not provided. */
const DEFAULT_NATS_SERVERS = 'nats://localhost:4222';

/**
 * Parses the NATS_SERVERS environment variable into a list of server URLs.
 * Accepts a single URL (`nats://localhost:4222`) or a comma-separated list
 * (`nats://nats-a:4222,nats://nats-b:4222`) for cluster/failover setups.
 */
function parseServers(value: string | undefined): string[] {
  return (value ?? DEFAULT_NATS_SERVERS)
    .split(',')
    .map((server) => server.trim())
    .filter((server) => server.length > 0);
}

/**
 * Shared NATS connection configuration namespace registered with ConfigModule.
 * Access it through `ConfigService.getOrThrow('nats')`. This factory is the
 * single place that maps environment variables to runtime options, so modules
 * and services never build configuration inline.
 */
export default registerAs('nats', (): NatsModuleOptions => ({
  servers: parseServers(process.env.NATS_SERVERS),
  connectionName: process.env.NATS_CONNECTION_NAME ?? 'nats-jetstream-app',
  timeout: parseInt(process.env.NATS_CONNECT_TIMEOUT ?? '5000', 10),
  failOnStartup:
    (process.env.NATS_FAIL_ON_STARTUP ?? 'false').toLowerCase() === 'true',
}));
