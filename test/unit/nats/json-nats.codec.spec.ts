import { JsonNatsCodec } from '@infrastructure/nats/core/json-nats.codec';

describe('JsonNatsCodec', () => {
  const codec = new JsonNatsCodec();

  it('round-trips JSON payloads', () => {
    const payload = { orderId: 'order-100', status: 'created' };

    expect(codec.decode(codec.encode(payload))).toEqual(payload);
  });

  it('supports UTF-8 payloads', () => {
    const payload = { value: 'مرحبا 👋' };

    expect(codec.decode(codec.encode(payload))).toEqual(payload);
  });

  it('rejects undefined payloads', () => {
    expect(() => codec.encode(undefined)).toThrow(/JSON-serializable/);
  });

  it('throws for malformed JSON bytes', () => {
    expect(() => codec.decode(new TextEncoder().encode('{bad-json'))).toThrow();
  });
});
