import { jetstreamManager } from '@nats-io/jetstream';
import { JetStreamService } from '@infrastructure/nats/jetstream/jetstream.service';
import type { NatsService } from '@infrastructure/nats/nats.service';

jest.mock('@nats-io/jetstream', () => ({
  jetstreamManager: jest.fn(),
}));

const mockedJetstreamManager = jetstreamManager as jest.MockedFunction<typeof jetstreamManager>;

describe('JetStreamService', () => {
  const connection = (id: string, closed = false, draining = false) => ({
    id,
    isClosed: jest.fn(() => closed),
    isDraining: jest.fn(() => draining),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps ensureConnection failures with manager-unavailable context and cause', async () => {
    const refused = new Error('connection refused');
    const service = new JetStreamService({
      ensureConnection: jest.fn(() => Promise.reject(refused)),
    } as unknown as NatsService);

    await expect(service.getManager()).rejects.toMatchObject({
      message: 'JetStream manager unavailable: connection refused',
      cause: refused,
    });
    await expect(service.getClient()).rejects.toMatchObject({
      message: 'JetStream manager unavailable: connection refused',
      cause: refused,
    });
    expect(mockedJetstreamManager).not.toHaveBeenCalled();
  });

  it('reuses the cached manager for the same connection object, including normal reconnect', async () => {
    const sharedConnection = connection('shared');
    const service = new JetStreamService({
      ensureConnection: jest.fn(() => Promise.resolve(sharedConnection)),
    } as unknown as NatsService);
    const manager = { jetstream: jest.fn(), streams: { info: jest.fn() } };
    mockedJetstreamManager.mockResolvedValue(manager as never);

    await expect(service.getManager()).resolves.toBe(manager);
    await expect(service.getManager()).resolves.toBe(manager);

    expect(mockedJetstreamManager).toHaveBeenCalledTimes(1);
    expect(mockedJetstreamManager).toHaveBeenCalledWith(sharedConnection);
  });

  it('creates a new manager when ensureConnection returns a different connection object', async () => {
    const firstConnection = connection('first');
    const secondConnection = connection('second');
    const service = new JetStreamService({
      ensureConnection: jest.fn()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection),
    } as unknown as NatsService);
    const firstManager = { id: 'first', jetstream: jest.fn() };
    const secondManager = { id: 'second', jetstream: jest.fn() };
    mockedJetstreamManager.mockResolvedValueOnce(firstManager as never).mockResolvedValueOnce(secondManager as never);

    await expect(service.getManager()).resolves.toBe(firstManager);
    await expect(service.getManager()).resolves.toBe(secondManager);

    expect(mockedJetstreamManager).toHaveBeenNthCalledWith(1, firstConnection);
    expect(mockedJetstreamManager).toHaveBeenNthCalledWith(2, secondConnection);
  });

  it('single-flights concurrent callers for the same connection object', async () => {
    const sharedConnection = connection('shared');
    const service = new JetStreamService({
      ensureConnection: jest.fn(() => Promise.resolve(sharedConnection)),
    } as unknown as NatsService);
    const manager = { jetstream: jest.fn() };
    mockedJetstreamManager.mockResolvedValue(manager as never);

    await Promise.all([service.getManager(), service.getManager(), service.getManager()]);

    expect(mockedJetstreamManager).toHaveBeenCalledTimes(1);
  });

  it('shares one initialization rejection for concurrent callers and retries successfully afterwards', async () => {
    const sharedConnection = connection('shared');
    const ensureConnection = jest.fn(() => Promise.resolve(sharedConnection));
    const service = new JetStreamService({ ensureConnection } as unknown as NatsService);
    const initFailure = new Error('manager init failed');
    const manager = { jetstream: jest.fn() };
    mockedJetstreamManager.mockRejectedValueOnce(initFailure).mockResolvedValueOnce(manager as never);

    const first = service.getManager();
    const second = service.getManager();

    await expect(first).rejects.toMatchObject({
      message: 'JetStream manager unavailable: manager init failed',
      cause: initFailure,
    });
    await expect(second).rejects.toMatchObject({
      message: 'JetStream manager unavailable: manager init failed',
      cause: initFailure,
    });
    await expect(service.getManager()).resolves.toBe(manager);
    expect(mockedJetstreamManager).toHaveBeenCalledTimes(2);
  });

  it('wraps non-Error manager initialization rejections with context and cause', async () => {
    const sharedConnection = connection('shared');
    const service = new JetStreamService({
      ensureConnection: jest.fn(() => Promise.resolve(sharedConnection)),
    } as unknown as NatsService);
    mockedJetstreamManager.mockRejectedValueOnce('permission denied');

    await expect(service.getManager()).rejects.toMatchObject({
      message: 'JetStream manager unavailable: permission denied',
      cause: 'permission denied',
    });
  });

  it('propagates closed, draining, and unhealthy connection failures from NatsService', async () => {
    const failures = [
      new Error('NATS connection is closed: localhost:4222'),
      new Error('NATS connection is draining.'),
      new Error('NATS connection is not healthy.'),
    ];

    for (const failure of failures) {
      const service = new JetStreamService({
        ensureConnection: jest.fn(() => Promise.reject(failure)),
      } as unknown as NatsService);
      await expect(service.getManager()).rejects.toMatchObject({
        message: `JetStream manager unavailable: ${failure.message}`,
        cause: failure,
      });
    }
  });

  it('derives every client from getManager().jetstream() without a separate client cache', async () => {
    const sharedConnection = connection('shared');
    const service = new JetStreamService({
      ensureConnection: jest.fn(() => Promise.resolve(sharedConnection)),
    } as unknown as NatsService);
    const firstClient = { id: 'first-client' };
    const secondClient = { id: 'second-client' };
    const manager = { jetstream: jest.fn().mockReturnValueOnce(firstClient).mockReturnValueOnce(secondClient) };
    mockedJetstreamManager.mockResolvedValue(manager as never);

    await expect(service.getClient()).resolves.toBe(firstClient);
    await expect(service.getClient()).resolves.toBe(secondClient);

    expect(mockedJetstreamManager).toHaveBeenCalledTimes(1);
    expect(manager.jetstream).toHaveBeenCalledTimes(2);
  });

  it('propagates manager.jetstream failures from getClient unchanged', async () => {
    const sharedConnection = connection('shared');
    const service = new JetStreamService({
      ensureConnection: jest.fn(() => Promise.resolve(sharedConnection)),
    } as unknown as NatsService);
    const nativeError = new Error('jetstream disabled');
    const manager = { jetstream: jest.fn(() => { throw nativeError; }) };
    mockedJetstreamManager.mockResolvedValue(manager as never);

    await expect(service.getClient()).rejects.toBe(nativeError);
  });

  it('recreates the manager for same-shaped connections when object identity changes', async () => {
    const firstConnection = connection('same-shape');
    const secondConnection = connection('same-shape');
    const service = new JetStreamService({
      ensureConnection: jest.fn()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection),
    } as unknown as NatsService);
    const firstManager = { id: 'first', jetstream: jest.fn() };
    const secondManager = { id: 'second', jetstream: jest.fn() };
    mockedJetstreamManager.mockResolvedValueOnce(firstManager as never).mockResolvedValueOnce(secondManager as never);

    await expect(service.getManager()).resolves.toBe(firstManager);
    await expect(service.getManager()).resolves.toBe(secondManager);

    expect(mockedJetstreamManager).toHaveBeenNthCalledWith(1, firstConnection);
    expect(mockedJetstreamManager).toHaveBeenNthCalledWith(2, secondConnection);
  });

  it('does not let a late old manager completion overwrite the newer connection cache', async () => {
    const firstConnection = connection('first');
    const secondConnection = connection('second');
    const service = new JetStreamService({
      ensureConnection: jest.fn()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection)
        .mockResolvedValue(secondConnection),
    } as unknown as NatsService);
    let resolveFirst: (manager: { id: string; jetstream: jest.Mock }) => void = () => undefined;
    const firstManagerPromise = new Promise((resolve) => { resolveFirst = resolve; });
    const firstManager = { id: 'first-manager', jetstream: jest.fn() };
    const secondManager = { id: 'second-manager', jetstream: jest.fn() };
    mockedJetstreamManager.mockReturnValueOnce(firstManagerPromise as never).mockResolvedValueOnce(secondManager as never);

    const firstGet = service.getManager();
    const secondGet = service.getManager();

    await expect(secondGet).resolves.toBe(secondManager);
    resolveFirst(firstManager);
    await expect(firstGet).resolves.toBe(firstManager);
    await expect(service.getManager()).resolves.toBe(secondManager);
  });

  it('does not let a late old manager rejection clear the newer connection cache', async () => {
    const firstConnection = connection('first');
    const secondConnection = connection('second');
    const service = new JetStreamService({
      ensureConnection: jest.fn()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection)
        .mockResolvedValue(secondConnection),
    } as unknown as NatsService);
    let rejectFirst: (error: Error) => void = () => undefined;
    const firstManagerPromise = new Promise((_resolve, reject) => { rejectFirst = reject; });
    const secondManager = { id: 'second-manager', jetstream: jest.fn() };
    mockedJetstreamManager.mockReturnValueOnce(firstManagerPromise as never).mockResolvedValueOnce(secondManager as never);

    const firstGet = service.getManager();
    const secondGet = service.getManager();

    await expect(secondGet).resolves.toBe(secondManager);
    const firstFailure = new Error('old manager failed');
    rejectFirst(firstFailure);
    await expect(firstGet).rejects.toMatchObject({
      message: 'JetStream manager unavailable: old manager failed',
      cause: firstFailure,
    });
    await expect(service.getManager()).resolves.toBe(secondManager);
  });

  it('repository no longer contains removed accessor symbols or token constants outside this proof test', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs');
    const path = jest.requireActual<typeof import('path')>('path');
    const root = process.cwd();
    const removed = new RegExp([
      'Lazy' + 'JetStream',
      'JetStream' + '(Client|Manager)' + 'Accessor',
      'JETSTREAM' + '_' + '(CLIENT|MANAGER)',
      'create' + 'Lazy' + 'JetStream',
      'jetstream' + '\\.' + 'providers',
    ].join('|'));
    const matches: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'dist', 'coverage', '.git'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (full.endsWith('.ts') && full !== __filename) {
          const content = fs.readFileSync(full, 'utf8');
          if (removed.test(content)) matches.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    expect(matches).toEqual([]);
  });
});
