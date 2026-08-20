import { Injectable, Logger } from '@nestjs/common';
import type {
  MsgRequest,
  PurgeOpts,
  PurgeResponse,
  StoredMsg,
  Stream,
  StreamConfig,
  StreamInfo,
  StreamInfoRequestOptions,
  StreamUpdateConfig,
} from '@nats-io/jetstream';
import { JetStreamService } from './jetstream.service';

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(private readonly jetStreamService: JetStreamService) {}

  /** Creates a JetStream stream using the native stream configuration shape. */
  async create(config: Pick<StreamConfig, 'name'> & Partial<StreamConfig>): Promise<StreamInfo> {
    return (await this.jetStreamService.getManager()).streams.add(config);
  }

  /** Reads current stream metadata and state from JetStream. */
  async getInfo(
    name: string,
    options?: Partial<StreamInfoRequestOptions>,
  ): Promise<StreamInfo> {
    return (await this.jetStreamService.getManager()).streams.info(name, options);
  }

  /** Updates mutable JetStream stream configuration fields. */
  async update(
    name: string,
    config: Partial<StreamUpdateConfig>,
  ): Promise<StreamInfo> {
    return (await this.jetStreamService.getManager()).streams.update(name, config);
  }

  /** Deletes a JetStream stream by name. */
  async delete(name: string): Promise<boolean> {
    return (await this.jetStreamService.getManager()).streams.delete(name);
  }

  /** Lists JetStream stream infos as an array. */
  async list(subject?: string): Promise<StreamInfo[]> {
    const lister = (await this.jetStreamService.getManager()).streams.list(subject);
    const streams: StreamInfo[] = [];
    for await (const stream of lister) {
      streams.push(stream);
    }
    return streams;
  }

  /** Lists JetStream stream names as an array. */
  async names(subject?: string): Promise<string[]> {
    const lister = (await this.jetStreamService.getManager()).streams.names(subject);
    const names: string[] = [];
    for await (const name of lister) {
      names.push(name);
    }
    return names;
  }

  /** Purges messages from a JetStream stream. */
  async purge(name: string, options?: PurgeOpts): Promise<PurgeResponse> {
    this.logger.debug?.(`Purging JetStream stream=${name}`);
    return (await this.jetStreamService.getManager()).streams.purge(name, options);
  }

  /** Finds the JetStream stream that stores a subject. */
  async find(subject: string): Promise<string> {
    return (await this.jetStreamService.getManager()).streams.find(subject);
  }

  /** Returns the native JetStream stream object. */
  async get(name: string): Promise<Stream> {
    return (await this.jetStreamService.getManager()).streams.get(name);
  }

  /** Retrieves a stored message from a JetStream stream. */
  async getMessage(stream: string, query: MsgRequest): Promise<StoredMsg | null> {
    return (await this.jetStreamService.getManager()).streams.getMessage(stream, query);
  }

  /** Deletes a stored message from a JetStream stream. */
  async deleteMessage(stream: string, seq: number, erase?: boolean): Promise<boolean> {
    return (await this.jetStreamService.getManager()).streams.deleteMessage(stream, seq, erase);
  }
}
