import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config/env', () => ({
  env: {},
  requireEnv: vi.fn((key: string) => {
    if (key === 'SLACK_WEBHOOK_URL') return 'https://hooks.slack.com/test';
    throw new Error(`Missing env: ${key}`);
  }),
}));

import { SlackService } from '@/services/slack.service';
import { kstDateToUtc } from '@/utils/date';

const sampleReport = {
  projectId: 'avail',
  periodStart: kstDateToUtc('2026-02-26', '00:00:00'),
  periodEnd: kstDateToUtc('2026-03-25', '23:59:59'),
  balanceStart: '600000000000000000000000',
  balanceEnd: '601234000000000000000000',
  totalWithdrawals: '0',
  rewardAmount: '1234000000000000000000',
  withdrawalCount: 0,
  generatedAt: new Date(),
  version: 1,
};

describe('SlackService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true, statusText: 'OK' });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sendReport: POST 요청 + 리포트 텍스트 포함', async () => {
    const service = new SlackService();
    await service.sendReport(sampleReport, 'AVAIL', 18);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.slack.com/test');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string) as { text: string };
    expect(body.text).toContain('Validator Reward Report');
    expect(body.text).toContain('AVAIL');
    expect(body.text).toContain('리포트 생성 완료');
  });

  it('sendError: POST 요청 + 체인/에러 텍스트 포함', async () => {
    const service = new SlackService();
    await service.sendError('avail', 'RPC timeout after 3 retries');

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { text: string };
    expect(body.text).toContain('[avail]');
    expect(body.text).toContain('RPC timeout after 3 retries');
  });
});
