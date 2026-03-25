# Design: monthly-reward

> **Feature**: `monthly-reward`
> **Phase**: Design
> **작성일**: 2026-03-24
> **작성자**: Claude Code

---

## 1. 구현 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/config/env.ts` | `REWARD_CYCLE_DAY` 추가 (기본값 26, 범위 1~28) |
| `src/services/storage.service.ts` | `getWithdrawals` 날짜 범위 변경, `getSnapshot` 헬퍼 추가 |
| `src/cli.ts` | 월단위 기준일 판별 및 이전 기준일 계산 로직 |
| `.env.example` | `REWARD_CYCLE_DAY=26` 추가 |

---

## 2. `src/config/env.ts`

```typescript
REWARD_CYCLE_DAY: z.coerce.number().int().min(1).max(28).default(26),
```

---

## 3. `src/services/storage.service.ts`

### `getSnapshot` 추가

```typescript
async getSnapshot(projectId: string, snapshotDate: string): Promise<{ balance: string } | null> {
  const db = await getDb();
  return db
    .collection<{ balance: string }>('balance_snapshots')
    .findOne({ projectId, snapshotDate });
}
```

### `getWithdrawals` 시그니처 변경

```typescript
// AS-IS: 단일 날짜
async getWithdrawals(projectId: string, date: string): Promise<WithdrawalRecord[]>
// 쿼리: { projectId, withdrawnAt: date }

// TO-BE: 날짜 범위
async getWithdrawals(projectId: string, fromDate: string, toDate: string): Promise<WithdrawalRecord[]>
// 쿼리: { projectId, withdrawnAt: { $gte: fromDate, $lte: toDate } }
```

---

## 4. `src/cli.ts` — `runChain` 변경

기준일 판별 및 이전 기준일 계산:

```typescript
const cycleDay = env.REWARD_CYCLE_DAY;
const dateObj = new Date(date);          // "YYYY-MM-DD" → UTC midnight
const isMonthlyDate = dateObj.getUTCDate() === cycleDay;

let previousDoc: { balance: string } | null = null;
let withdrawals: WithdrawalRecord[] = [];

if (isMonthlyDate) {
  // 지난달 같은 날짜 (UTC 기준)
  const prevDate = new Date(dateObj);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const previousCycleDate = prevDate.toISOString().slice(0, 10);

  // 출금 기간: 지난달 N+1일 ~ 이번달 N일
  const fromDate = new Date(prevDate);
  fromDate.setUTCDate(fromDate.getUTCDate() + 1);
  const withdrawalFromDate = fromDate.toISOString().slice(0, 10);

  previousDoc = await storage.getSnapshot(data.projectId, previousCycleDate);
  withdrawals = await storage.getWithdrawals(data.projectId, withdrawalFromDate, date);
}
```

기존 `getDb()` 직접 호출 제거 — `storage.getSnapshot()` 으로 대체.

---

## 5. 날짜 계산 예시

| 실행 날짜 (`REWARD_CYCLE_DAY=26`) | 동작 |
|----------------------------------|------|
| `2026-03-26` (기준일) | 이전 기준: `2026-02-26`, 출금 범위: `2026-02-27 ~ 2026-03-26` |
| `2026-03-24` (비기준일) | `rewardAmount = null`, 잔고만 저장 |
| `2026-02-26` (기준일) | 이전 기준: `2026-01-26`, 출금 범위: `2026-01-27 ~ 2026-02-26` |

---

## 6. 검증 기준 (DoD)

- [ ] `REWARD_CYCLE_DAY` 기본값 26, 범위 1~28 적용
- [ ] `--date 2026-03-26` 실행 시 `rewardAmount` 계산 (이전 기준: `2026-02-26`)
- [ ] `--date 2026-03-24` 실행 시 `rewardAmount = null`
- [ ] `getWithdrawals` 날짜 범위 쿼리(`$gte`, `$lte`) 적용
- [ ] `getSnapshot` 헬퍼 동작 확인
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] `npm test` 전체 통과
