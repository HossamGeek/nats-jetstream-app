import { Injectable } from '@nestjs/common';
import { jetstreamManager, type JetStreamClient, type JetStreamManager } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/transport-node';
import { NatsService } from '../nats.service';

@Injectable()
export class JetStreamService {
  private manager: JetStreamManager | null = null;
  private managerConnection: NatsConnection | null = null;
  private inFlight: { connection: NatsConnection; promise: Promise<JetStreamManager> } | null = null;

  constructor(private readonly natsService: NatsService) {}

  /** Lazily provides the native JetStream manager for the active NATS connection. */
  async getManager(): Promise<JetStreamManager> {
    let connection: NatsConnection;
    try {
      connection = await this.natsService.ensureConnection();
    } catch (error) {
      throw this.unavailableError(error);
    }

    if (this.manager && this.managerConnection === connection) {
      return this.manager;
    }

    if (this.inFlight?.connection === connection) {
      return this.inFlight.promise;
    }

    const promise = jetstreamManager(connection)
      .then((manager) => {
        if (this.inFlight?.connection === connection && this.inFlight.promise === promise) {
          this.manager = manager;
          this.managerConnection = connection;
        }
        return manager;
      })
      .catch((error: unknown) => {
        throw this.unavailableError(error);
      })
      .finally(() => {
        if (this.inFlight?.connection === connection && this.inFlight.promise === promise) {
          this.inFlight = null;
        }
      });

    this.inFlight = { connection, promise };
    return promise;
  }

  async getClient(): Promise<JetStreamClient> {
    return (await this.getManager()).jetstream();
  }

  private unavailableError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    const unavailable = new Error(`JetStream manager unavailable: ${message}`);
    (unavailable as Error & { cause?: unknown }).cause = error;
    return unavailable;
  }
}
