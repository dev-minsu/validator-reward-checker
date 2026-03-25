import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiPromise, WsProvider } from '@polkadot/api';

vi.mock('@polkadot/api', () => ({
  ApiPromise: { create: vi.fn() },
  WsProvider: vi.fn(),
}));

vi.mock('@/config/networks', () => ({
  availConfig: {
    projectId: 'avail',
    fetchType: 'A',
    decimals: 18,
    rpcUrl: 'wss://avail-test.example.com',
    walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  },
}));

const mockAccount = vi.fn().mockResolvedValue({
  data: {
    free: { toBigInt: () => 1_000_000_000_000_000_000n, toString: () => '1000000000000000000' },
    reserved: { toBigInt: () => 0n, toString: () => '0' },
  },
});
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockApi = {
  query: { system: { account: mockAccount } },
  disconnect: mockDisconnect,
};

describe('AvailFetcher', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(ApiPromise.create).mockResolvedValue(mockApi as never);
    mockAccount.mockClear();
    mockDisconnect.mockClear();
    mockAccount.mockResolvedValue({
      data: {
        free: { toBigInt: () => 1_000_000_000_000_000_000n, toString: () => '1000000000000000000' },
        reserved: { toBigInt: () => 0n, toString: () => '0' },
      },
    });
  });

  it('정상 잔고 조회 시 ok: true 반환', async () => {
    const { AvailFetcher } = await import('@/fetchers/avail.fetcher');
    const fetcher = new AvailFetcher();
    const result = await fetcher.fetch('2026-03-19');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.balance).toBe('1000000000000000000');
      expect(result.data.fetchType).toBe('A');
    }
  });

  it('planck → AVAIL 변환 검증', async () => {
    const { AvailFetcher } = await import('@/fetchers/avail.fetcher');
    const { toHuman } = await import('@/utils/bignum');
    const fetcher = new AvailFetcher();
    const result = await fetcher.fetch('2026-03-19');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(toHuman(result.data.balance!, 18)).toBe('1');
    }
  });

  it('RPC 오류 시 3회 재시도 후 ok: false 반환', async () => {
    mockAccount.mockRejectedValue(new Error('RPC error'));
    const { AvailFetcher } = await import('@/fetchers/avail.fetcher');
    const fetcher = new AvailFetcher();
    const result = await fetcher.fetch('2026-03-19');

    expect(result.ok).toBe(false);
    expect(mockAccount).toHaveBeenCalledTimes(3);
  });

  it('성공·실패 모두 api.disconnect() 호출', async () => {
    const { AvailFetcher } = await import('@/fetchers/avail.fetcher');
    const fetcher = new AvailFetcher();

    // 성공 케이스 — disconnect 1회
    await fetcher.fetch('2026-03-19');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);

    mockDisconnect.mockClear();
    mockAccount.mockRejectedValue(new Error('fail'));

    // 실패 케이스 — 재시도 3회 × disconnect 각 1회 = 3회
    await fetcher.fetch('2026-03-19');
    expect(mockDisconnect).toHaveBeenCalledTimes(3);
  });
});
