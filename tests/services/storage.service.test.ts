import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReplaceOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
const mockFind = vi.fn();
const mockCollection = vi.fn().mockReturnValue({
  replaceOne: mockReplaceOne,
  find: mockFind,
});

vi.mock('@/db/client', () => ({
  getDb: vi.fn().mockReturnValue({ collection: mockCollection }),
}));

describe('StorageService', () => {
  beforeEach(() => {
    vi.resetModules();
    mockReplaceOne.mockClear();
    mockFind.mockClear();
    mockFind.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
  });

  it('saveSnapshot 호출 시 upsert: true 옵션 전달', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    await service.saveSnapshot({
      projectId: 'avail',
      snapshotDate: '2026-03-19',
      balance: '1000000000000000000',
      rewardAmount: '1',
      fetchType: 'A',
    });

    expect(mockReplaceOne).toHaveBeenCalledWith(
      { projectId: 'avail', snapshotDate: '2026-03-19' },
      expect.objectContaining({ projectId: 'avail', balance: '1000000000000000000' }),
      { upsert: true },
    );
  });

  it('getWithdrawals — 올바른 filter 전달', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    await service.getWithdrawals('avail', '2026-03-19');

    expect(mockFind).toHaveBeenCalledWith({ projectId: 'avail', withdrawnAt: '2026-03-19' });
  });

  it('getWithdrawals — 결과 없으면 빈 배열 반환', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    const result = await service.getWithdrawals('avail', '2026-03-19');

    expect(result).toEqual([]);
  });
});
