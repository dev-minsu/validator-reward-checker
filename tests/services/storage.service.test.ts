import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReplaceOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
const mockFind = vi.fn();
const mockFindOne = vi.fn();
const mockCollection = vi.fn().mockReturnValue({
  replaceOne: mockReplaceOne,
  find: mockFind,
  findOne: mockFindOne,
});

vi.mock('@/db/client', () => ({
  getDb: vi.fn().mockResolvedValue({ collection: mockCollection }),
}));

describe('StorageService', () => {
  beforeEach(() => {
    vi.resetModules();
    mockReplaceOne.mockClear();
    mockFind.mockClear();
    mockFindOne.mockClear();
    mockFind.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    mockFindOne.mockResolvedValue(null);
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

  it('saveSnapshot — rewardAmount가 null일 때 정상 저장 (최초 실행)', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    await service.saveSnapshot({
      projectId: 'avail',
      snapshotDate: '2026-03-19',
      balance: '1000000000000000000',
      rewardAmount: null,
      fetchType: 'A',
    });

    expect(mockReplaceOne).toHaveBeenCalledWith(
      { projectId: 'avail', snapshotDate: '2026-03-19' },
      expect.objectContaining({ rewardAmount: null }),
      { upsert: true },
    );
  });

  it('getWithdrawals — 날짜 범위 filter 전달 ($gte/$lte)', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    await service.getWithdrawals('avail', '2026-02-27', '2026-03-26');

    expect(mockFind).toHaveBeenCalledWith({
      projectId: 'avail',
      withdrawnAt: { $gte: '2026-02-27', $lte: '2026-03-26' },
    });
  });

  it('getWithdrawals — 결과 없으면 빈 배열 반환', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    const result = await service.getWithdrawals('avail', '2026-02-27', '2026-03-26');

    expect(result).toEqual([]);
  });

  it('getSnapshot — 올바른 filter로 스냅샷 조회', async () => {
    mockFindOne.mockResolvedValue({ balance: '648173780900000000000000' });
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    const result = await service.getSnapshot('avail', '2026-02-26');

    expect(mockFindOne).toHaveBeenCalledWith({ projectId: 'avail', snapshotDate: '2026-02-26' });
    expect(result?.balance).toBe('648173780900000000000000');
  });

  it('getSnapshot — 스냅샷 없으면 null 반환', async () => {
    mockFindOne.mockResolvedValue(null);
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    const result = await service.getSnapshot('avail', '2026-01-26');

    expect(result).toBeNull();
  });

  it('saveBalanceHistory — upsert: true + createdAt 포함', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    const snapshotAt = new Date('2026-02-26T15:00:00.000Z');
    await service.saveBalanceHistory({
      projectId: 'avail',
      snapshotAt,
      balance: '600000000000000000000000',
      fetchType: 'A',
    });

    expect(mockReplaceOne).toHaveBeenCalledWith(
      { projectId: 'avail', snapshotAt },
      expect.objectContaining({ projectId: 'avail', balance: '600000000000000000000000', fetchType: 'A', createdAt: expect.any(Date) }),
      { upsert: true },
    );
  });

  it('getSnapshotAt — snapshotAt $lte 필터 + sort desc 전달', async () => {
    const beforeOrAt = new Date('2026-02-25T15:00:00.000Z');
    mockFindOne.mockResolvedValue({ balance: '600000000000000000000000', snapshotAt: beforeOrAt });
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    const result = await service.getSnapshotAt('avail', beforeOrAt);

    expect(mockFindOne).toHaveBeenCalledWith(
      { projectId: 'avail', snapshotAt: { $lte: beforeOrAt } },
      { sort: { snapshotAt: -1 } },
    );
    expect(result?.balance).toBe('600000000000000000000000');
  });
});
