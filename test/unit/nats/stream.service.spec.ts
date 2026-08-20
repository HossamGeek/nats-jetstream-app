import { StreamService } from '@infrastructure/nats/jetstream/stream.service';
import type { JetStreamService } from '@infrastructure/nats/jetstream/jetstream.service';

const lister = <T>(items: T[]) => ({
  [Symbol.asyncIterator]() {
    let index = 0;
    return {
      next: () => Promise.resolve(
        index < items.length
          ? { value: items[index++], done: false }
          : { value: undefined, done: true },
      ),
    };
  },
  next: jest.fn(() => Promise.resolve(items)),
});

const failingLister = (error: Error) => ({
  [Symbol.asyncIterator]() {
    return {
      next: () => Promise.reject(error),
    };
  },
});

describe('StreamService', () => {
  const streams = {
    add: jest.fn(),
    info: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
    names: jest.fn(),
    purge: jest.fn(),
    find: jest.fn(),
    get: jest.fn(),
    getMessage: jest.fn(),
    deleteMessage: jest.fn(),
  };
  const jetStreamService = {
    getManager: jest.fn(() => Promise.resolve({ streams })),
  };
  let service: StreamService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StreamService(jetStreamService as unknown as JetStreamService);
  });

  it('gets the native manager explicitly through JetStreamService', async () => {
    streams.info.mockResolvedValue({ config: { name: 'ORDERS' } });

    await service.getInfo('ORDERS');

    expect(jetStreamService.getManager).toHaveBeenCalledTimes(1);
    expect(streams.info).toHaveBeenCalledWith('ORDERS', undefined);
  });

  it('delegates core stream admin methods to the native JetStream stream API', async () => {
    streams.add.mockResolvedValue({ config: { name: 'ORDERS' } });
    streams.info.mockResolvedValue({ config: { name: 'ORDERS' } });
    streams.update.mockResolvedValue({ config: { description: 'updated' } });
    streams.delete.mockResolvedValue(true);

    await expect(service.create({ name: 'ORDERS', subjects: ['orders.>'] })).resolves.toEqual({ config: { name: 'ORDERS' } });
    await expect(service.getInfo('ORDERS', { subjects_filter: 'orders.*' })).resolves.toEqual({ config: { name: 'ORDERS' } });
    await expect(service.update('ORDERS', { description: 'updated' })).resolves.toEqual({ config: { description: 'updated' } });
    await expect(service.delete('ORDERS')).resolves.toBe(true);

    expect(streams.add).toHaveBeenCalledWith({ name: 'ORDERS', subjects: ['orders.>'] });
    expect(streams.info).toHaveBeenCalledWith('ORDERS', { subjects_filter: 'orders.*' });
    expect(streams.update).toHaveBeenCalledWith('ORDERS', { description: 'updated' });
    expect(streams.delete).toHaveBeenCalledWith('ORDERS');
  });

  it('consumes native listers for list and names arrays', async () => {
    streams.list.mockReturnValue(lister([{ config: { name: 'A' } }, { config: { name: 'B' } }]));
    streams.names.mockReturnValue(lister(['A', 'B']));

    await expect(service.list('orders.>')).resolves.toEqual([{ config: { name: 'A' } }, { config: { name: 'B' } }]);
    await expect(service.names('orders.>')).resolves.toEqual(['A', 'B']);

    expect(streams.list).toHaveBeenCalledWith('orders.>');
    expect(streams.names).toHaveBeenCalledWith('orders.>');
  });

  it('returns empty arrays for empty native list and names iterators', async () => {
    streams.list.mockReturnValue(lister([]));
    streams.names.mockReturnValue(lister([]));

    await expect(service.list()).resolves.toEqual([]);
    await expect(service.names()).resolves.toEqual([]);

    expect(streams.list).toHaveBeenCalledWith(undefined);
    expect(streams.names).toHaveBeenCalledWith(undefined);
  });

  it('propagates iterator errors from list and names unchanged', async () => {
    const listError = new Error('list page failed');
    const namesError = new Error('names page failed');
    streams.list.mockReturnValue(failingLister(listError));
    streams.names.mockReturnValue(failingLister(namesError));

    await expect(service.list()).rejects.toBe(listError);
    await expect(service.names()).rejects.toBe(namesError);
  });

  it('delegates purge/find/get/getMessage/deleteMessage to the native stream API', async () => {
    streams.purge.mockResolvedValue({ success: true, purged: 2 });
    streams.find.mockResolvedValue('ORDERS');
    streams.get.mockResolvedValue({ name: 'ORDERS' });
    streams.getMessage.mockResolvedValue({ seq: 1 });
    streams.deleteMessage.mockResolvedValue(true);

    await expect(service.purge('ORDERS', { seq: 2 })).resolves.toEqual({ success: true, purged: 2 });
    await expect(service.find('orders.created')).resolves.toBe('ORDERS');
    await expect(service.get('ORDERS')).resolves.toEqual({ name: 'ORDERS' });
    await expect(service.getMessage('ORDERS', { seq: 1 })).resolves.toEqual({ seq: 1 });
    await expect(service.deleteMessage('ORDERS', 1, false)).resolves.toBe(true);
    streams.getMessage.mockResolvedValueOnce(null);
    await expect(service.getMessage('ORDERS', { seq: 404 })).resolves.toBeNull();
    await expect(service.purge('ORDERS')).resolves.toEqual({ success: true, purged: 2 });
    await expect(service.deleteMessage('ORDERS', 2)).resolves.toBe(true);
    await expect(service.deleteMessage('ORDERS', 3, true)).resolves.toBe(true);

    expect(streams.purge).toHaveBeenCalledWith('ORDERS', { seq: 2 });
    expect(streams.find).toHaveBeenCalledWith('orders.created');
    expect(streams.get).toHaveBeenCalledWith('ORDERS');
    expect(streams.getMessage).toHaveBeenCalledWith('ORDERS', { seq: 1 });
    expect(streams.deleteMessage).toHaveBeenCalledWith('ORDERS', 1, false);
    expect(streams.getMessage).toHaveBeenCalledWith('ORDERS', { seq: 404 });
    expect(streams.purge).toHaveBeenCalledWith('ORDERS', undefined);
    expect(streams.deleteMessage).toHaveBeenCalledWith('ORDERS', 2, undefined);
    expect(streams.deleteMessage).toHaveBeenCalledWith('ORDERS', 3, true);
  });

  it('propagates getManager failures before invoking representative native methods', async () => {
    const managerError = new Error('manager unavailable');
    jetStreamService.getManager
      .mockRejectedValueOnce(managerError)
      .mockRejectedValueOnce(managerError)
      .mockRejectedValueOnce(managerError);

    await expect(service.create({ name: 'ORDERS' })).rejects.toBe(managerError);
    await expect(service.list()).rejects.toBe(managerError);
    await expect(service.deleteMessage('ORDERS', 1)).rejects.toBe(managerError);

    expect(streams.add).not.toHaveBeenCalled();
    expect(streams.list).not.toHaveBeenCalled();
    expect(streams.deleteMessage).not.toHaveBeenCalled();
  });

  it('propagates native JetStream errors unchanged', async () => {
    const nativeError = new Error('stream already exists');
    streams.add.mockRejectedValue(nativeError);

    await expect(service.create({ name: 'ORDERS' })).rejects.toBe(nativeError);
  });
});
