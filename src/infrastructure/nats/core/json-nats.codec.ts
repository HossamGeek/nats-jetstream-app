import type { Codec } from '@nats-io/transport-node';

/**
 * Central JSON codec for Core NATS payloads.
 *
 * NATS transports bytes; this keeps JSON stringify/parse and UTF-8 conversion
 * in one place instead of scattering it through publishers and subscribers.
 */
export class JsonNatsCodec implements Codec<unknown> {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  /** Encodes JSON-compatible values into NATS byte payloads. */
  encode(data: unknown): Uint8Array {
    // Serialize once here so publish callers do not duplicate JSON.stringify/TextEncoder logic.
    const json = JSON.stringify(data);
    if (json === undefined) {
      // Reject unsupported JSON inputs early so subscribers do not receive unreadable empty payloads.
      throw new Error('Core NATS JSON payload must be JSON-serializable.');
    }

    // NATS publish accepts bytes, so convert the JSON string to UTF-8 bytes.
    return this.encoder.encode(json);
  }

  /** Decodes NATS byte payloads back into JSON values. */
  decode(data: Uint8Array): unknown {
    // Keep parse/TextDecoder paired with encode() so payload handling stays centralized.
    return JSON.parse(this.decoder.decode(data)) as unknown;
  }
}
