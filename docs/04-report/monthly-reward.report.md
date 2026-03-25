# PDCA Completion Report: monthly-reward

> **Feature**: `monthly-reward`
> **Phase**: Completed
> **작성일**: 2026-03-24
> **작성자**: Claude Code
> **Match Rate**: 100%

---

## 1. 요약

리워드 계산 주기를 **하루 단위**에서 **월단위**로 변경했다.
`REWARD_CYCLE_DAY` 환경 변수로 기준일(기본 26일)을 설정하며,
기준일에만 이전 기준일과의 잔고 차이로 `rewardAmount`를 계산한다.
비기준일 실행 시에는 잔고만 저장하고 `rewardAmount = null`을 반환한다.

---

## 2. 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/config/env.ts` | `REWARD_CYCLE_DAY` 추가 (기본 26, 범위 1~28) |
| `src/services/storage.service.ts` | `getSnapshot()` 헬퍼 추가, `getWithdrawals()` 날짜 범위로 변경 |
| `src/cli.ts` | 월단위 기준일 판별 및 이전 기준일 계산 로직 |
| `.env.example` | `REWARD_CYCLE_DAY=26` 추가 |
| `tests/services/storage.service.test.ts` | `getWithdrawals` 범위 쿼리 테스트, `getSnapshot` 테스트 추가 (4→6 cases) |
| `tests/config/env.test.ts` | `REWARD_CYCLE_DAY` 기본값/설정 테스트 추가 |

---

## 3. 핵심 구현

### 기준일 판별 로직 (`src/cli.ts`)

```typescript
const cycleDay = env.REWARD_CYCLE_DAY;
const dateObj = new Date(date);  // "YYYY-MM-DD" → UTC midnight
const isMonthlyDate = dateObj.getUTCDate() === cycleDay;

if (isMonthlyDate) {
  const prevDate = new Date(dateObj);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const previousCycleDate = prevDate.toISOString().slice(0, 10);

  const fromDateObj = new Date(prevDate);
  fromDateObj.setUTCDate(fromDateObj.getUTCDate() + 1);
  const withdrawalFromDate = fromDateObj.toISOString().slice(0, 10);

  previousDoc = await storage.getSnapshot(data.projectId, previousCycleDate);
  withdrawals = await storage.getWithdrawals(data.projectId, withdrawalFromDate, date);
}
```

### 날짜 범위 출금 조회 (`src/services/storage.service.ts`)

```typescript
async getWithdrawals(projectId: string, fromDate: string, toDate: string): Promise<WithdrawalRecord[]> {
  const db = await getDb();
  return db
    .collection<WithdrawalRecord>('withdrawal_records')
    .find({ projectId, withdrawnAt: { $gte: fromDate, $lte: toDate } })
    .toArray();
}
```

---

## 4. 동작 예시 (`REWARD_CYCLE_DAY=26`)

| 실행 날짜 | 동작 |
|----------|------|
| `2026-03-26` | `2026-02-26` 스냅샷 조회, 출금 범위 `2026-02-27~2026-03-26`, `rewardAmount` 계산 |
| `2026-03-24` | 잔고만 저장, `rewardAmount = null` |
| `2026-02-26` | `2026-01-26` 스냅샷 조회, 출금 범위 `2026-01-27~2026-02-26`, `rewardAmount` 계산 |

---

## 5. 검증 결과

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | ✅ 에러 없음 |
| `npm test` (44 cases) | ✅ 전체 통과 |
| Gap Analysis Match Rate | ✅ 100% (12/12 항목 일치) |

---

## 6. seed-balance 시드 데이터와의 연계

`2026-02-26` 시드 잔고 `648173780900000000000000` planck가
`npm run cli -- --chain avail --date 2026-03-26 --dry-run` 실행 시 활용된다.

```bash
npm run cli -- --chain avail --date 2026-03-26 --dry-run
# rewardAmount = (2026-03-26 실시간 잔고) - 648173780900000000000000 + 기간 출금합산
```

---

## 7. 학습 및 인사이트

- `new Date("YYYY-MM-DD")` 는 UTC midnight으로 파싱됨 → `getUTCDate()` 사용으로 timezone 무관하게 날짜 비교 가능
- `setUTCMonth`는 일자가 해당 월의 최대일을 넘으면 다음 달로 넘어가므로, `max(28)` 제한이 안전 장치
- `getWithdrawals`의 시그니처를 단일 날짜 → 범위로 변경해 월단위 집계가 가능해짐
