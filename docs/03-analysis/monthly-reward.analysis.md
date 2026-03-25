# monthly-reward Analysis Report

> **Analysis Type**: Gap Analysis
>
> **Project**: validator-reward-updater
> **Version**: 0.1.0
> **Analyst**: Claude Code
> **Date**: 2026-03-24
> **Design Doc**: `docs/02-design/features/monthly-reward.design.md`

---

## 1. Gap Analysis (Design vs Implementation)

### `src/config/env.ts`

| Design | Implementation | Status |
|--------|---------------|--------|
| `REWARD_CYCLE_DAY: z.coerce.number().int().min(1).max(28).default(26)` | 동일 | ✅ Match |

### `src/services/storage.service.ts`

| Design | Implementation | Status |
|--------|---------------|--------|
| `getSnapshot(projectId, snapshotDate)` 시그니처 | 동일 | ✅ Match |
| `findOne({ projectId, snapshotDate })` 쿼리 | 동일 | ✅ Match |
| `getWithdrawals(projectId, fromDate, toDate)` 3-param | 동일 | ✅ Match |
| `{ $gte: fromDate, $lte: toDate }` 범위 쿼리 | 동일 | ✅ Match |

### `src/cli.ts`

| Design | Implementation | Status |
|--------|---------------|--------|
| `cycleDay = env.REWARD_CYCLE_DAY` | 동일 | ✅ Match |
| `isMonthlyDate = dateObj.getUTCDate() === cycleDay` | 동일 | ✅ Match |
| `setUTCMonth(getUTCMonth() - 1)` 이전 기준일 | 동일 | ✅ Match |
| 출금 from = prevDate + 1일 | `setUTCDate(getUTCDate() + 1)` | ✅ Match |
| `storage.getSnapshot()` → `isMonthlyDate` guard 안 | 동일 | ✅ Match |
| `storage.getWithdrawals(projectId, withdrawalFromDate, date)` | 동일 | ✅ Match |
| `previousDoc?.balance ?? null` → `calculateTypeA` | 동일 | ✅ Match |
| 직접 `getDb()` 호출 제거 | import 없음, storage.* 만 사용 | ✅ Match |

### `.env.example`

| Design | Implementation | Status |
|--------|---------------|--------|
| `REWARD_CYCLE_DAY=26` 추가 | 동일 | ✅ Match |

---

## 2. Match Rate Summary

```
┌─────────────────────────────────────────────┐
│  Overall Match Rate: 100%                    │
├─────────────────────────────────────────────┤
│  ✅ Match:          12 items (100%)          │
│  ⚠️ Missing design:  0 items (0%)            │
│  ❌ Not implemented:  0 items (0%)           │
└─────────────────────────────────────────────┘
```

---

## 3. Differences Found

없음. 설계와 구현이 12개 비교 항목 모두 완전히 일치.

---

## 4. Next Step

Match Rate >= 90% → `/pdca report monthly-reward`
