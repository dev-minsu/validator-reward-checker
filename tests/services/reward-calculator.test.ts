import { describe, it, expect } from 'vitest';
import { calculateTypeA } from '@/services/reward-calculator';

describe('calculateTypeA', () => {
  it('기본 계산: today - yesterday', () => {
    expect(calculateTypeA('2', '1', [])).toBe('1');
  });

  it('출금 보정: (today + withdrawal) - yesterday', () => {
    expect(calculateTypeA('1', '2', ['1.5'])).toBe('0.5');
  });

  it('최초 실행 (yesterdayBalance = null) → null 반환', () => {
    expect(calculateTypeA('1', null, [])).toBeNull();
  });

  it('잔고 감소 + 출금 없음 → 음수 리워드 반환', () => {
    expect(calculateTypeA('0.5', '1', [])).toBe('-0.5');
  });
});
