import BigNumber from 'bignumber.js';
import { logger } from '@/utils/logger';

/**
 * Type A 리워드 계산: (오늘 잔고 + 당일 출금액 합산) - 어제 잔고
 *
 * @param todayBalance     - 오늘 잔고 (human 단위 string, e.g. '1.5')
 * @param yesterdayBalance - 어제 잔고 (human 단위 string | null: 최초 실행)
 * @param withdrawals      - 당일 출금액 목록 (human 단위 string[])
 * @returns 리워드 string | null (최초 실행 시)
 */
export function calculateTypeA(
  todayBalance: string,
  yesterdayBalance: string | null,
  withdrawals: string[],
): string | null {
  if (yesterdayBalance === null) {
    logger.info({ todayBalance }, 'first run — no yesterday snapshot, skipping reward calc');
    return null;
  }

  const today = new BigNumber(todayBalance);
  const yesterday = new BigNumber(yesterdayBalance);
  const totalWithdrawal = withdrawals.reduce(
    (sum, w) => sum.plus(new BigNumber(w)),
    new BigNumber(0),
  );

  const reward = today.plus(totalWithdrawal).minus(yesterday);

  if (reward.isNegative() && totalWithdrawal.isZero()) {
    logger.warn(
      { todayBalance, yesterdayBalance },
      'reward is negative with no withdrawal — possible missed withdrawal record',
    );
  }

  return reward.toFixed();
}
