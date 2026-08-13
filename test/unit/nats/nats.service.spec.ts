import { Test, TestingModule } from '@nestjs/testing';
import { connect } from '@nats-io/transport-node';
import { Logger } from '@nestjs/common';
import { NatsService } from '@infrastructure/nats/nats.service';
import { NATS_OPTIONS } from '@shared/constants/nats.constants';

jest.mock('@nats-io/transport-node', () => ({
  // Unit tests verify our lifecycle logic without opening a real socket.
  connect: jest.fn(),
}));

// Typed helper so expectations can inspect calls made to the mocked connect().
const mockedConnect = connect as jest.MockedFunction<typeof connect>;

describe('NatsService', () => {
  let service: NatsService;
  let loggerErrorSpy: jest.SpyInstance;
  // Minimal fake NATS connection with only the methods used by NatsService.
  const fakeConnection = {
    isClosed: jest.fn(() => false),
    isDraining: jest.fn(() => false),
    drain: jest.fn(() => Promise.resolve(undefined)),
  };

  beforeEach(async () => {
    // Reset mocks to keep each test isolated from previous connect/close calls.
    jest.clearAllMocks();
    // Suppress expected error logs from tests that intentionally simulate connect failures.
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    fakeConnection.isClosed.mockReturnValue(false);
    fakeConnection.isDraining.mockReturnValue(false);
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

    await service.onModuleDestroy();

    expect(fakeConnection.drain).not.toHaveBeenCalled();
    expect(() => service.connection).toThrow(/not available/);
  });

  it('does not drain an already draining connection', async () => {
    await service.onModuleInit();
    fakeConnection.isDraining.mockReturnValue(true);

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
