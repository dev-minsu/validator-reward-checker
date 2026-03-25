import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindOne, mockReplaceOne, mockCollection } = vi.hoisted(() => {
  const mockFindOne = vi.fn();
  const mockReplaceOne = vi.fn();
  const mockCollection = vi.fn().mockReturnValue({
    findOne: mockFindOne,
    replaceOne: mockReplaceOne,
  });
  return { mockFindOne, mockReplaceOne, mockCollection };
});

vi.mock('@/db/client', () => ({
  getDb: vi.fn().mockResolvedValue({ collection: mockCollection }),
}));

import { ReportService } from '@/services/report.service';
import type { StorageService } from '@/services/storage.service';
import type { IndexerService } from '@/services/indexer.service';
import { kstDateToUtc } from '@/utils/date';

const periodStart = kstDateToUtc('2026-02-26', '00:00:00');
const periodEnd = kstDateToUtc('2026-03-25', '23:59:59');

describe('ReportService.generate', () => {
  let mockStorage: Partial<StorageService>;
  let mockIndexer: Partial<IndexerService>;

  beforeEach(() => {
    mockFindOne.mockReset();
    mockReplaceOne.mockReset();
    mockFindOne.mockResolvedValue(null); // no existing report → version = 1
    mockReplaceOne.mockResolvedValue({});

    mockStorage = {
      getSnapshotAt: vi
        .fn()
        .mockResolvedValueOnce({ balance: '600000000000000000000000', snapshotAt: periodStart })
        .mockResolvedValueOnce({ balance: '601234000000000000000000', snapshotAt: periodEnd }),
    };
    mockIndexer = {
      fetchWithdrawals: vi.fn().mockResolvedValue([]),
    };
  });

  it('기본 리워드 계산 (인출 없음): balanceEnd - balanceStart', async () => {
    const service = new ReportService(
      mockStorage as StorageService,
      mockIndexer as IndexerService,
    );
    const report = await service.generate('avail', periodStart, periodEnd);

    // 601234e18 - 600000e18 = 1234e18
    expect(report.rewardAmount).toBe('1234000000000000000000');
    expect(report.withdrawalCount).toBe(0);
    expect(report.totalWithdrawals).toBe('0');
  });

  it('인출 보정 포함: (balanceEnd + withdrawals) - balanceStart', async () => {
    mockIndexer.fetchWithdrawals = vi
      .fn()
      .mockResolvedValue([{ amount: '500000000000000000000' }]);

    const service = new ReportService(
      mockStorage as StorageService,
      mockIndexer as IndexerService,
    );
    const report = await service.generate('avail', periodStart, periodEnd);

    // 601234e18 + 500e18 - 600000e18 = 1734e18
    expect(report.rewardAmount).toBe('1734000000000000000000');
    expect(report.withdrawalCount).toBe(1);
  });

  it('dryRun=true 시 DB 저장 미호출', async () => {
    const service = new ReportService(
      mockStorage as StorageService,
      mockIndexer as IndexerService,
    );
    await service.generate('avail', periodStart, periodEnd, { dryRun: true });

    expect(mockReplaceOne).not.toHaveBeenCalled();
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('재생성 시 version increment', async () => {
    mockFindOne.mockResolvedValue({ version: 3 }); // 기존 버전 3

    const service = new ReportService(
      mockStorage as StorageService,
      mockIndexer as IndexerService,
    );
    const report = await service.generate('avail', periodStart, periodEnd);

    expect(report.version).toBe(4);
  });
});

describe('ReportService.toCsv', () => {
  it('올바른 CSV 헤더 및 행 생성', () => {
    const mockStorage = {} as StorageService;
    const mockIndexer = {} as IndexerService;
    const service = new ReportService(mockStorage, mockIndexer);

    const report = {
      projectId: 'avail',
      periodStart,
      periodEnd,
      balanceStart: '600000000000000000000000',
      balanceEnd: '601234000000000000000000',
      totalWithdrawals: '0',
      rewardAmount: '1234000000000000000000',
      withdrawalCount: 0,
      generatedAt: new Date('2026-03-25T10:00:00Z'),
      version: 1,
    };

    const csv = service.toCsv(report);
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe(
      'projectId,periodStart,periodEnd,balanceStart,balanceEnd,totalWithdrawals,rewardAmount,withdrawalCount',
    );
    expect(lines[1]).toContain('avail,');
    expect(lines[1]).toContain('1234000000000000000000');
  });
});
