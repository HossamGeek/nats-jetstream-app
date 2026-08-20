import { Test, TestingModule } from '@nestjs/testing';
import { connect } from '@nats-io/transport-node';
import { Logger } from '@nestjs/common';
import { NatsService } from '@infrastructure/nats/nats.service';
import { NATS_OPTIONS } from '@shared/constants/nats.constants';
import type { Status } from '@nats-io/nats-core';

jest.mock('@nats-io/transport-node', () => ({
  // Unit tests verify our lifecycle logic without opening a real socket.
  connect: jest.fn(),
}));

// Typed helper so expectations can inspect calls made to the mocked connect().
const mockedConnect = connect as jest.MockedFunction<typeof connect>;

describe('NatsService', () => {
  let service: NatsService;
  let loggerErrorSpy: jest.SpyInstance;
  const createStatusSource = () => {
    const queue: IteratorResult<Status>[] = [];
    let waiter: ((value: IteratorResult<Status>) => void) | null = null;
    return {
      emit(status: Status): void {
        const value = { value: status, done: false };
        if (waiter) {
          waiter(value);
          waiter = null;
        } else {
          queue.push(value);
        }
      },
      end(): void {
        const value = { value: undefined, done: true } as IteratorResult<Status>;
        if (waiter) {
          waiter(value);
          waiter = null;
        } else {
          queue.push(value);
        }
      },
      iterable: {
        [Symbol.asyncIterator]() {
          return {
            next: () => {
              const queued = queue.shift();
              if (queued) {
                return Promise.resolve(queued);
              }
              return new Promise<IteratorResult<Status>>((resolve) => {
                waiter = resolve;
              });
            },
          };
        },
      },
    };
  };

  let statusSource = createStatusSource();
  const fakeConnection = {
    isClosed: jest.fn(() => false),
    isDraining: jest.fn(() => false),
    status: jest.fn(() => statusSource.iterable),
    getServer: jest.fn(() => 'nats://localhost:4222'),
    drain: jest.fn(() => {
      statusSource.end();
      return Promise.resolve(undefined);
    }),
  };

  beforeEach(async () => {
    // Reset mocks to keep each test isolated from previous connect/close calls.
    jest.clearAllMocks();
    // Suppress expected error logs from tests that intentionally simulate connect failures.
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    fakeConnection.isClosed.mockReturnValue(false);
    fakeConnection.isDraining.mockReturnValue(false);
    fakeConnection.getServer.mockReturnValue('nats://localhost:4222');
    statusSource = createStatusSource();
    mockedConnect.mockResolvedValue(fakeConnection as never);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NATS_OPTIONS,
          // Inject test configuration directly through the same token used in production.
          useValue: {
            servers: ['nats://localhost:4222'],
            connectionName: 'unit-test',
          },
        },
        NatsService,
      ],
    }).compile();

    service = moduleRef.get(NatsService);
  });

  afterEach(() => {
    statusSource.end();
    loggerErrorSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws when the connection is accessed before init', () => {
    // Accessing the raw connection before onModuleInit() should fail loudly.
    expect(() => service.connection).toThrow(/not available/);
    expect(service.isConnected).toBe(false);
  });

  it('connects on module init using the configured servers', async () => {
    // Simulates Nest invoking the provider initialization hook.
    await service.onModuleInit();

    // Ensures the parsed server list is passed to the official NATS transport connect() call.
    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(mockedConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: ['nats://localhost:4222'],
        name: 'unit-test',
      }),
    );
    expect(service.isConnected).toBe(true);
    expect(service.lastError).toBeNull();
  });

  it('ensureConnection opens the shared connection once and onModuleInit reuses it', async () => {
    await expect(service.ensureConnection()).resolves.toBe(fakeConnection);
    await service.onModuleInit();

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    expect(service.isConnected).toBe(true);
  });

  it('single-flights concurrent connection establishment', async () => {
    let resolveConnect: (connection: typeof fakeConnection) => void = () => undefined;
    mockedConnect.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConnect = resolve;
      }) as never,
    );

    const initPromise = service.onModuleInit();
    const ensurePromiseA = service.ensureConnection();
    const ensurePromiseB = service.ensureConnection();

    expect(mockedConnect).toHaveBeenCalledTimes(1);
    resolveConnect(fakeConnection);

    await expect(Promise.all([initPromise, ensurePromiseA, ensurePromiseB])).resolves.toEqual([
      undefined,
      fakeConnection,
      fakeConnection,
    ]);
    expect(mockedConnect).toHaveBeenCalledTimes(1);
  });

  it('awaits an in-flight connection during shutdown and drains a late successful connection', async () => {
    let resolveConnect: (connection: typeof fakeConnection) => void = () => undefined;
    mockedConnect.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConnect = resolve;
      }) as never,
    );

    const ensurePromise = service.ensureConnection().catch((error: unknown) => error);
    expect(mockedConnect).toHaveBeenCalledTimes(1);

    const destroyPromise = service.onModuleDestroy();
    resolveConnect(fakeConnection);

    await expect(destroyPromise).resolves.toBeUndefined();
    await expect(ensurePromise).resolves.toBeInstanceOf(Error);
    expect(fakeConnection.drain).toHaveBeenCalledTimes(1);
    expect(service.isConnected).toBe(false);
    expect(() => service.connection).toThrow(/not available/);
  });

  it('drains the connection on module destroy', async () => {
    // Create then destroy the connection to verify graceful lifecycle cleanup.
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(fakeConnection.drain).toHaveBeenCalledTimes(1);
    expect(service.isConnected).toBe(false);
    expect(() => service.connection).toThrow(/not available/);
  });

  it('does not drain an already closed connection', async () => {
    await service.onModuleInit();
    fakeConnection.isClosed.mockReturnValue(true);
    statusSource.end();

    await service.onModuleDestroy();

    expect(fakeConnection.drain).not.toHaveBeenCalled();
    expect(() => service.connection).toThrow(/not available/);
  });

  it('does not drain an already draining connection', async () => {
    await service.onModuleInit();
    fakeConnection.isDraining.mockReturnValue(true);
    statusSource.end();

    await service.onModuleDestroy();

    expect(fakeConnection.drain).not.toHaveBeenCalled();
    expect(() => service.connection).toThrow(/not available/);
  });

  it('keeps the application alive and records the error when connect fails', async () => {
    // Default behavior records the error for health checks without throwing.
    const failure = new Error('connection refused');
    mockedConnect.mockRejectedValueOnce(failure);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(service.isConnected).toBe(false);
    expect(service.lastError?.message).toBe('connection refused');
  });

  it('ensureConnection rethrows the stored normalized connection error after a lazy failed connect', async () => {
    const failure = new Error('root connection refused');
    mockedConnect.mockRejectedValueOnce(failure);

    await expect(service.ensureConnection()).rejects.toBe(failure);
    expect(service.lastError).toBe(failure);
  });

  it('preserves generic NATS error status without marking a usable connection unhealthy', async () => {
    await service.onModuleInit();
    const rootError = new Error('server went away');

    statusSource.emit({ type: 'error', error: rootError });
    await new Promise((resolve) => setImmediate(resolve));

    expect(service.lastError).toBe(rootError);
    expect(service.isConnected).toBe(true);
    await expect(service.ensureConnection()).resolves.toBe(fakeConnection);
    expect(mockedConnect).toHaveBeenCalledTimes(1);
  });

  it('clears a closed connection before reconnect and throws the new root error if reconnect fails', async () => {
    await service.onModuleInit();
    fakeConnection.isClosed.mockReturnValue(true);
    const reconnectFailure = new Error('reconnect refused');
    mockedConnect.mockRejectedValueOnce(reconnectFailure);

    await expect(service.ensureConnection()).rejects.toBe(reconnectFailure);

    expect(mockedConnect).toHaveBeenCalledTimes(2);
    expect(service.lastError).toBe(reconnectFailure);
    expect(() => service.connection).toThrow(/not available/);
  });

  it('throws current closed state when the connection closes between checks after a stale generic status error', async () => {
    await service.onModuleInit();
    const genericError = new Error('transient server warning');

    statusSource.emit({ type: 'error', error: genericError });
    await new Promise((resolve) => setImmediate(resolve));
    fakeConnection.isClosed.mockReturnValueOnce(false).mockReturnValueOnce(true);

    await expect(service.ensureConnection()).rejects.toThrow('NATS connection is closed: nats://localhost:4222');
    expect(service.lastError?.message).toBe('NATS connection is closed: nats://localhost:4222');
    expect(mockedConnect).toHaveBeenCalledTimes(1);
  });

  it('ensureConnection rejects a draining connection without starting a manual reconnect', async () => {
    await service.onModuleInit();
    fakeConnection.isDraining.mockReturnValue(true);

    await expect(service.ensureConnection()).rejects.toThrow('NATS connection is draining.');

    expect(mockedConnect).toHaveBeenCalledTimes(1);
  });

  it('throws current draining state instead of a stale generic status error', async () => {
    await service.onModuleInit();
    const genericError = new Error('transient server warning');

    statusSource.emit({ type: 'error', error: genericError });
    await new Promise((resolve) => setImmediate(resolve));
    fakeConnection.isDraining.mockReturnValue(true);

    await expect(service.ensureConnection()).rejects.toThrow('NATS connection is draining.');
    expect(service.lastError?.message).toBe('NATS connection is draining.');
  });

  it('throws current tracked disconnected state instead of a stale generic status error', async () => {
    await service.onModuleInit();
    const genericError = new Error('transient server warning');

    statusSource.emit({ type: 'error', error: genericError });
    await new Promise((resolve) => setImmediate(resolve));
    statusSource.emit({ type: 'reconnecting' });
    await new Promise((resolve) => setImmediate(resolve));

    await expect(service.ensureConnection()).rejects.toThrow('NATS connection status: reconnecting');
    expect(service.lastError?.message).toBe('NATS connection status: reconnecting');
  });

  it.each<Status>([
    { type: 'disconnect', server: 'nats://localhost:4222' },
    { type: 'reconnecting' },
    { type: 'staleConnection' },
    { type: 'forceReconnect' },
    { type: 'close' },
  ])('marks connection unhealthy on %s status', async (status) => {
    await service.onModuleInit();

    statusSource.emit(status);
    await new Promise((resolve) => setImmediate(resolve));

    expect(service.isConnected).toBe(false);
    expect(service.lastError?.message).toContain(status.type);
  });

  it('keeps connection healthy on generic error status and clears lastError on reconnect', async () => {
    await service.onModuleInit();
    const nativeError = new Error('server error');

    statusSource.emit({ type: 'error', error: nativeError });
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.isConnected).toBe(true);
    expect(service.lastError).toBe(nativeError);

    statusSource.emit({ type: 'reconnect', server: 'nats://localhost:4222' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.isConnected).toBe(true);
    expect(service.lastError).toBeNull();
  });

  it('uses exactly one status monitor for the current connection and awaits it on shutdown', async () => {
    await service.onModuleInit();
    await service.ensureConnection();

    expect(fakeConnection.status).toHaveBeenCalledTimes(1);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('ignores stale status events from a previous connection monitor', async () => {
    const firstSource = createStatusSource();
    const secondSource = createStatusSource();
    const firstConnection = {
      isClosed: jest.fn(() => false),
      isDraining: jest.fn(() => false),
      status: jest.fn(() => firstSource.iterable),
      drain: jest.fn(() => {
        firstSource.end();
        return Promise.resolve(undefined);
      }),
    };
    const secondConnection = {
      isClosed: jest.fn(() => false),
      isDraining: jest.fn(() => false),
      status: jest.fn(() => secondSource.iterable),
      drain: jest.fn(() => {
        secondSource.end();
        return Promise.resolve(undefined);
      }),
    };
    mockedConnect.mockResolvedValueOnce(firstConnection as never).mockResolvedValueOnce(secondConnection as never);

    await service.onModuleInit();
    firstConnection.isClosed.mockReturnValue(true);
    await expect(service.ensureConnection()).resolves.toBe(secondConnection);

    firstSource.emit({ type: 'error', error: new Error('old connection error') });
    await new Promise((resolve) => setImmediate(resolve));

    expect(service.isConnected).toBe(true);
    expect(service.lastError).toBeNull();
    expect(firstConnection.status).toHaveBeenCalledTimes(1);
    expect(secondConnection.status).toHaveBeenCalledTimes(1);

    await service.onModuleDestroy();
    firstSource.end();
  });

  it('re-throws the connect error when failOnStartup is enabled', async () => {
    // Fail-fast mode is tested separately because it intentionally aborts startup.
    mockedConnect.mockRejectedValueOnce(new Error('connection refused'));

    const failingService = new NatsService({
      servers: ['nats://localhost:4222'],
      failOnStartup: true,
    });

    await expect(failingService.onModuleInit()).rejects.toThrow('connection refused');
  });
});
