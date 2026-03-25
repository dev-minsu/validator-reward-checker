import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('env', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.MONGO_DB_URI;
    delete process.env.LOG_LEVEL;
    delete process.env.REWARD_CYCLE_DAY;
    delete process.env.BALANCE_COLLECTION_CRON;
    delete process.env.REPORT_CRON;
    delete process.env.REPORT_DEFAULT_START_DAY;
    delete process.env.AVAIL_SUBSCAN_API_KEY;
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it('MONGO_DB_URI 없이도 정상 파싱 (optional)', async () => {
    const { env } = await import('@/config/env');
    expect(env.MONGO_DB_URI).toBeUndefined();
  });

  it('LOG_LEVEL 기본값 info', async () => {
    const { env } = await import('@/config/env');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('MONGO_DB_URI 설정 시 정상 파싱', async () => {
    process.env.MONGO_DB_URI = 'mongodb://localhost:27017/test';
    const { env } = await import('@/config/env');
    expect(env.MONGO_DB_URI).toBe('mongodb://localhost:27017/test');
  });

  it('REWARD_CYCLE_DAY 기본값 26', async () => {
    const { env } = await import('@/config/env');
    expect(env.REWARD_CYCLE_DAY).toBe(26);
  });

  it('REWARD_CYCLE_DAY 환경 변수로 설정', async () => {
    process.env.REWARD_CYCLE_DAY = '15';
    const { env } = await import('@/config/env');
    expect(env.REWARD_CYCLE_DAY).toBe(15);
  });

  it('BALANCE_COLLECTION_CRON 기본값', async () => {
    const { env } = await import('@/config/env');
    expect(env.BALANCE_COLLECTION_CRON).toBe('0 * * * *');
  });

  it('REPORT_CRON 기본값', async () => {
    const { env } = await import('@/config/env');
    expect(env.REPORT_CRON).toBe('0 0 26 * *');
  });

  it('REPORT_DEFAULT_START_DAY 기본값 26', async () => {
    const { env } = await import('@/config/env');
    expect(env.REPORT_DEFAULT_START_DAY).toBe(26);
  });

  it('AVAIL_SUBSCAN_API_KEY 미설정 시 undefined (optional)', async () => {
    const { env } = await import('@/config/env');
    expect(env.AVAIL_SUBSCAN_API_KEY).toBeUndefined();
  });

  it('SLACK_WEBHOOK_URL 미설정 시 undefined (optional)', async () => {
    const { env } = await import('@/config/env');
    expect(env.SLACK_WEBHOOK_URL).toBeUndefined();
  });
});

describe('requireEnv', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.MONGO_DB_URI;
    delete process.env.LOG_LEVEL;
    delete process.env.REWARD_CYCLE_DAY;
  });

  it('설정된 변수 반환', async () => {
    process.env.MONGO_DB_URI = 'mongodb://localhost:27017/test';
    const { requireEnv } = await import('@/config/env');
    expect(requireEnv('MONGO_DB_URI')).toBe('mongodb://localhost:27017/test');
  });

  it('미설정 변수 접근 시 Error throw', async () => {
    const { requireEnv } = await import('@/config/env');
    expect(() => requireEnv('MONGO_DB_URI')).toThrow(
      'Missing required environment variable: MONGO_DB_URI',
    );
  });
});
