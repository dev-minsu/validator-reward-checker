import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockToArray, mockReplaceOne, mockFindOne, mockCollection } = vi.hoisted(() => {
  const mockToArray = vi.fn();
  const mockReplaceOne = vi.fn();
  const mockFindOne = vi.fn();

  // 컬렉션별 mock 분리: indexer_query_cache ↔ withdrawal_records
  const mockCollection = vi.fn().mockImplementation((name: string) => {
    if (name === 'indexer_query_cache') {
      return { findOne: mockFindOne, replaceOne: mockReplaceOne };
    }
    return {
      find: () => ({ toArray: mockToArray }),
      replaceOne: mockReplaceOne,
    };
  });

  return { mockToArray, mockReplaceOne, mockFindOne, mockCollection };
});

vi.mock('@/db/client', () => ({
  getDb: vi.fn().mockResolvedValue({ collection: mockCollection }),
}));

vi.mock('@/config/env', () => ({
  env: {},
  requireEnv: vi.fn((key: string) => {
    if (key === 'AVAIL_SUBSCAN_API_KEY') return 'test-key';
    throw new Error(`Missing env: ${key}`);
  }),
}));

import { IndexerService } from '@/services/indexer.service';
import { kstDateToUtc } from '@/utils/date';

const periodStart = kstDateToUtc('2026-02-26', '00:00:00');
const periodEnd = kstDateToUtc('2026-03-25', '23:59:59');

describe('IndexerService.fetchWithdrawals', () => {
  beforeEach(() => {
    mockToArray.mockReset();
    mockReplaceOne.mockReset();
    mockFindOne.mockReset();
    mockReplaceOne.mockResolvedValue({});
    mockFindOne.mockResolvedValue(null); // 기본: 캐시 없음
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('캐시 히트 (count > 0) 시 withdrawal_records 반환, Subscan 미호출', async () => {
    const cached = [
      { txHash: '0xabc', amount: '1000', projectId: 'avail', periodKey: '2026-02-26_2026-03-25' },
    ];
    mockFindOne.mockResolvedValueOnce({ count: 1, periodKey: '2026-02-26_2026-03-25' });
    mockToArray.mockResolvedValueOnce(cached);

    const service = new IndexerService();
    const result = await service.fetchWithdrawals('avail', periodStart, periodEnd);

    expect(result).toEqual(cached);
    expect(mockFindOne).toHaveBeenCalledOnce();
  });

  it('캐시 히트 (count = 0) 시 빈 배열 반환, Subscan 및 withdrawal_records 미호출', async () => {
    mockFindOne.mockResolvedValueOnce({ count: 0, periodKey: '2026-02-26_2026-03-25' });

    const service = new IndexerService();
    const result = await service.fetchWithdrawals('avail', periodStart, periodEnd);

    expect(result).toEqual([]);
    expect(mockToArray).not.toHaveBeenCalled();
  });

  it('캐시 미스 시 Subscan API 호출 후 withdrawal_records + query_cache 저장', async () => {
    mockFindOne.mockResolvedValueOnce(null); // cache miss

    const txTimestamp = Math.floor(new Date('2026-03-01T00:00:00Z').getTime() / 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            transfers: [
              { hash: '0xdef', block_num: 1234, block_timestamp: txTimestamp, amount: '5000' },
            ],
            count: 1,
          },
          message: 'Success',
        }),
      }),
    );

    const service = new IndexerService();
    const result = await service.fetchWithdrawals('avail', periodStart, periodEnd);

    expect(result).toHaveLength(1);
    expect(result[0].txHash).toBe('0xdef');
    expect(result[0].amount).toBe('5000');
    // withdrawal_records upsert + indexer_query_cache upsert = 2회
    expect(mockReplaceOne).toHaveBeenCalledTimes(2);
    // query_cache upsert에 count: 1 포함 확인
    const cacheCall = mockReplaceOne.mock.calls.find(
      ([, doc]) => (doc as { count?: number }).count !== undefined,
    );
    expect(cacheCall).toBeDefined();
    expect((cacheCall![1] as { count: number }).count).toBe(1);
  });

  it('Subscan 0건 반환 시 빈 배열 + query_cache에 count=0으로 저장', async () => {
    mockFindOne.mockResolvedValueOnce(null); // cache miss
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { transfers: [], count: 0 }, message: 'Success' }),
      }),
    );

    const service = new IndexerService();
    const result = await service.fetchWithdrawals('avail', periodStart, periodEnd);

    expect(result).toHaveLength(0);
    // withdrawal_records upsert 없음, query_cache upsert만 1회
    expect(mockReplaceOne).toHaveBeenCalledOnce();
    const [, doc] = mockReplaceOne.mock.calls[0] as [unknown, { count: number }];
    expect(doc.count).toBe(0);
  });

  it('빈 결과 캐싱 후 재호출 시 Subscan 미호출 (end-to-end 캐시 효과 검증)', async () => {
    // 1차: cache miss → Subscan 0건 → query_cache에 count=0 저장
    mockFindOne.mockResolvedValueOnce(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { transfers: [], count: 0 }, message: 'Success' }),
      }),
    );

    const service = new IndexerService();
    await service.fetchWithdrawals('avail', periodStart, periodEnd);

    // 2차: count=0인 캐시 히트 → Subscan 미호출
    mockFindOne.mockResolvedValueOnce({ count: 0, periodKey: '2026-02-26_2026-03-25' });
    const result2 = await service.fetchWithdrawals('avail', periodStart, periodEnd);

    expect(result2).toEqual([]);
    // fetch는 1차 호출에서만 1회 실행
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
