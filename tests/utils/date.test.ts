import { describe, it, expect, vi, afterEach } from 'vitest';
import { kstDateToUtc, utcToKstDateStr, toPeriodKey, getDefaultPeriod } from '@/utils/date';

describe('kstDateToUtc', () => {
  it('00:00:00 KST → UTC (2026-02-25T15:00:00.000Z)', () => {
    const result = kstDateToUtc('2026-02-26', '00:00:00');
    expect(result.toISOString()).toBe('2026-02-25T15:00:00.000Z');
  });

  it('23:59:59 KST → UTC (2026-03-25T14:59:59.000Z)', () => {
    const result = kstDateToUtc('2026-03-25', '23:59:59');
    expect(result.toISOString()).toBe('2026-03-25T14:59:59.000Z');
  });
});

describe('utcToKstDateStr', () => {
  it('UTC → KST 날짜 문자열 변환', () => {
    const date = new Date('2026-02-25T15:00:00.000Z');
    expect(utcToKstDateStr(date)).toBe('2026-02-26');
  });

  it('UTC 자정은 전날 KST로 변환', () => {
    const date = new Date('2026-03-25T00:00:00.000Z'); // KST: 2026-03-25 09:00
    expect(utcToKstDateStr(date)).toBe('2026-03-25');
  });
});

describe('toPeriodKey', () => {
  it('UTC Date 쌍을 KST 날짜 기반 periodKey로 변환', () => {
    const start = kstDateToUtc('2026-02-26', '00:00:00');
    const end = kstDateToUtc('2026-03-25', '23:59:59');
    expect(toPeriodKey(start, end)).toBe('2026-02-26_2026-03-25');
  });
});

describe('getDefaultPeriod', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('오늘 2026-03-25 기준 기본 기간 계산 (startDay=26)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T06:00:00.000Z')); // KST: 2026-03-25 15:00

    const { periodStart, periodEnd } = getDefaultPeriod(26);
    // periodStart: 전월(2월) 26일 00:00:00 KST = 2026-02-25T15:00:00Z
    expect(periodStart.toISOString()).toBe('2026-02-25T15:00:00.000Z');
    // periodEnd: 어제(2026-03-24) 23:59:59 KST = 2026-03-24T14:59:59Z
    expect(periodEnd.toISOString()).toBe('2026-03-24T14:59:59.000Z');
  });
});
