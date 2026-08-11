import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, type NatsConnection } from '@nats-io/transport-node';
import { NATS_OPTIONS } from '../../shared/constants/nats.constants';
import type { NatsModuleOptions } from '../../shared/interfaces/nats/nats-options.interface';

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);

  private natsConnection: NatsConnection | null = null;
  private connectionError: Error | null = null;

  constructor(@Inject(NATS_OPTIONS) private readonly options: NatsModuleOptions) {}

  /**
   * The underlying NATS connection. Throws when the connection has not been
   * established (e.g. startup failed and `failOnStartup` is disabled).
   */
  get connection(): NatsConnection {
    if (!this.natsConnection) {
      throw new Error(
        'NATS connection is not available. Inspect application startup logs for connection errors.',
      );
    }
    return this.natsConnection;
  }

  get isConnected(): boolean {
    // A connection is considered usable only when it exists and NATS.js has not closed it.
    return this.natsConnection ? !this.natsConnection.isClosed() : false;
  }

  get lastError(): Error | null {
    // Exposed read-only for health reporting and tests.
    return this.connectionError;
  }

  async onModuleInit(): Promise<void> {
    // Provide a default timeout even if the environment variable is absent.
    const timeout = this.options.timeout ?? 5000;
    try {
      // Official modern NATS.js Node transport API. This is the only place the
      // application creates a connection, preserving one shared connection.
      this.natsConnection = await connect({
        servers: this.options.servers,
        name: this.options.connectionName ?? 'nats-jetstream-app',
        timeout,
      });
      this.connectionError = null;
      this.logger.log(`Connected to NATS at ${this.options.servers.join(', ')}`);
    } catch (err) {
      // Normalize unknown thrown values into Error so logging and health output are safe.
      this.connectionError = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `Failed to connect to NATS at ${this.options.servers.join(', ')}: ${this.connectionError.message}`,
      );
      // In fail-fast mode, rethrowing makes NestJS startup fail clearly.
      if (this.options.failOnStartup) {
        throw this.connectionError;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    // enables shutdown hooks. It drains the connection so future subscriptions
    // can finish in-flight work and pending outbound messages can be flushed.
    if (!this.natsConnection) {
      return;
    }

    if (this.natsConnection.isClosed() || this.natsConnection.isDraining()) {
      this.natsConnection = null;
      this.logger.log('NATS connection already closed or draining');
      return;
    }

    await this.natsConnection.drain();
    this.natsConnection = null;
    this.logger.log('NATS connection drained');
  }
}
