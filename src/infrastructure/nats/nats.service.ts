import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Status } from '@nats-io/nats-core';
import { connect, type NatsConnection } from '@nats-io/transport-node';
import { NATS_OPTIONS } from '@shared/constants/nats.constants';
import type { NatsModuleOptions } from '@shared/interfaces/nats/nats-options.interface';

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsService.name);

  private natsConnection: NatsConnection | null = null;
  private connectionError: Error | null = null;
  private connectionPromise: Promise<void> | null = null;
  private statusMonitorPromise: Promise<void> | null = null;
  private statusMonitorConnection: NatsConnection | null = null;
  private isShuttingDown = false;
  private isConnectionHealthy = false;

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
    return this.natsConnection
      ? this.isConnectionHealthy && !this.natsConnection.isClosed() && !this.natsConnection.isDraining()
      : false;
  }

  get lastError(): Error | null {
    // Exposed read-only for health reporting and tests.
    return this.connectionError;
  }

  async ensureConnection(): Promise<NatsConnection> {
    if (this.natsConnection?.isClosed()) {
      this.natsConnection = null;
      this.isConnectionHealthy = false;
    }

    if (!this.natsConnection) {
      await this.connectOnce();
    }

    if (!this.natsConnection) {
      throw this.connectionError ?? new Error('NATS connection is not available.');
    }

    if (this.natsConnection.isClosed()) {
      const closedConnection = this.natsConnection;
      this.natsConnection = null;
      this.isConnectionHealthy = false;
      this.connectionError = new Error(`NATS connection is closed: ${closedConnection.getServer()}`);
      throw this.connectionError;
    }

    if (this.natsConnection.isDraining()) {
      this.connectionError = new Error('NATS connection is draining.');
      throw this.connectionError;
    }

    if (!this.isConnectionHealthy) {
      if (this.connectionError?.message.startsWith('NATS connection status:')) {
        throw this.connectionError;
      }
      this.connectionError = new Error('NATS connection is not healthy.');
      throw this.connectionError;
    }

    return this.natsConnection;
  }

  async onModuleInit(): Promise<void> {
    if (this.natsConnection && !this.natsConnection.isClosed()) {
      return;
    }
    await this.connectOnce();
  }

  private connectOnce(): Promise<void> {
    // Single-flight connection establishment: concurrent onModuleInit/provider
    // calls share one in-progress connect() attempt and can never create duplicate sockets.
    this.connectionPromise ??= this.openConnection().finally(() => {
      this.connectionPromise = null;
    });
    return this.connectionPromise;
  }

  private async openConnection(): Promise<void> {
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
      if (this.isShuttingDown) {
        await this.drainCurrentConnection();
        return;
      }
      this.connectionError = null;
      this.isConnectionHealthy = true;
      this.startStatusMonitor(this.natsConnection);
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
    this.isShuttingDown = true;
    if (this.connectionPromise) {
      await this.connectionPromise.catch(() => undefined);
    }
    await this.drainCurrentConnection();
    await this.statusMonitorPromise?.catch(() => undefined);
  }

  private startStatusMonitor(connection: NatsConnection): void {
    if (this.statusMonitorConnection === connection && this.statusMonitorPromise) {
      return;
    }

    this.statusMonitorConnection = connection;
    this.statusMonitorPromise = this.monitorConnectionStatus(connection).finally(() => {
      if (this.statusMonitorConnection === connection) {
        this.statusMonitorConnection = null;
        this.statusMonitorPromise = null;
      }
    });
  }

  private async monitorConnectionStatus(connection: NatsConnection): Promise<void> {
    for await (const status of connection.status()) {
      if (this.statusMonitorConnection !== connection) {
        return;
      }
      this.applyConnectionStatus(status);
    }
  }

  private applyConnectionStatus(status: Status): void {
    switch (status.type) {
      case 'reconnect':
        this.isConnectionHealthy = true;
        this.connectionError = null;
        this.logger.log(`Reconnected to NATS at ${status.server}`);
        break;
      case 'error':
        this.connectionError = status.error;
        this.logger.error(`NATS connection error: ${status.error.message}`);
        break;
      case 'disconnect':
      case 'reconnecting':
      case 'staleConnection':
      case 'forceReconnect':
      case 'close':
        this.isConnectionHealthy = false;
        this.connectionError = new Error(`NATS connection status: ${status.type}`);
        break;
      default:
        break;
    }
  }

  private async drainCurrentConnection(): Promise<void> {
    // enables shutdown hooks. It drains the connection so future subscriptions
    // can finish in-flight work and pending outbound messages can be flushed.
    if (!this.natsConnection) {
      return;
    }

    if (this.natsConnection.isClosed() || this.natsConnection.isDraining()) {
      this.natsConnection = null;
      this.isConnectionHealthy = false;
      this.logger.log('NATS connection already closed or draining');
      return;
    }

    await this.natsConnection.drain();
    this.natsConnection = null;
    this.isConnectionHealthy = false;
    this.logger.log('NATS connection drained');
  }
}
