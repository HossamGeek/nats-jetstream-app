import { Test, TestingModule } from '@nestjs/testing';
import { NatsService } from '@infrastructure/nats/nats.service';
import { HealthController } from '../../../src/modules/health/health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  // Simple mutable stub lets each test control the reported NATS state.
  const natsServiceStub: { isConnected: boolean; lastError: Error | null } = {
    isConnected: true,
    lastError: null,
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      // Inject the stub instead of a real NatsService so this remains a unit test.
      providers: [{ provide: NatsService, useValue: natsServiceStub }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reports ok when NATS is connected', () => {
    // Healthy path: connected and no recorded startup/connection error.
    natsServiceStub.isConnected = true;
    natsServiceStub.lastError = null;

    expect(controller.check()).toEqual({
      status: 'ok',
      info: { nats: { status: 'up' } },
      error: {},
      details: { nats: { status: 'up' } },
    });
  });

  it('reports error with the last error message when NATS is down', () => {
    // Failure path: the controller should expose the captured error message.
    natsServiceStub.isConnected = false;
    natsServiceStub.lastError = new Error('connection refused');

    const result = controller.check();
    expect(result.status).toBe('error');
    expect(result.error.nats).toEqual({
      status: 'down',
      message: 'connection refused',
    });
    expect(result.details.nats.status).toBe('down');
    expect(result.info).toEqual({});
  });
});
