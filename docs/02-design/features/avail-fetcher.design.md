# Design: Phase 1-4/1-5/1-6 — Avail Fetcher + CLI + 테스트

> **Feature**: `avail-fetcher`
> **Phase**: Design
> **작성일**: 2026-03-19
> **참고 문서**: [Plan](../../01-plan/features/avail-fetcher.plan.md) | [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## 1. 개요

Avail (Type A) 리워드 수집 End-to-End 파이프라인을 구현한다.
Substrate RPC → 잔고 조회 → 리워드 계산 → MongoDB 저장 → CLI 실행의 전체 흐름을 담당하는
6개 파일(구현 4 + 테스트 3)을 작성한다.

---

## 2. 파일 구조

```
src/
├── fetchers/
│   └── avail.fetcher.ts       # IFetcher 구현 — Substrate RPC 잔고 조회
├── services/
│   ├── reward-calculator.ts   # Type A 리워드 계산 순수 함수
│   └── storage.service.ts     # balance_snapshots upsert + withdrawal 조회
└── cli.ts                     # --chain / --date / --dry-run CLI 진입점

tests/
├── fetchers/
│   └── avail.fetcher.test.ts
└── services/
    ├── reward-calculator.test.ts
    └── storage.service.test.ts
```

---

## 3. `src/fetchers/avail.fetcher.ts` 설계

### 3-1. 전체 구현

```typescript
import { ApiPromise, WsProvider } from '@polkadot/api';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { withRetry } from '@/utils/retry';
import { toHuman } from '@/utils/bignum';
import type { IFetcher, FetchResult } from '@/fetchers/base.fetcher';

export class AvailFetcher implements IFetcher {
  readonly projectName = 'avail';
  readonly fetchType = 'A' as const;

  async fetch(date: string): Promise<FetchResult> {
    return withRetry(() => this._fetchOnce(date), {
      maxAttempts: 3,
      baseDelayMs: 1000,
    });
  }

  private async _fetchOnce(date: string): Promise<FetchResult> {
    const provider = new WsProvider(env.AVAIL_RPC_URL);
    const api = await ApiPromise.create({ provider });

    try {
      const accountInfo = await api.query.system.account(env.AVAIL_WALLET_ADDRESS);
      const { data } = accountInfo;
      const planck = (data.free.toBigInt() + data.reserved.toBigInt()).toString();
      const balance = toHuman(planck, 18);

      logger.info({ chain: 'avail', date, balance }, 'snapshot fetched');

      return {
        ok: true,
        data: {
          projectId: 'avail',
          snapshotDate: date,
          balance: planck,
          fetchType: 'A',
          rawData: { free: data.free.toString(), reserved: data.reserved.toString() },
        },
      };
    } catch (error) {
      logger.error({ chain: 'avail', date, error }, 'fetch failed');
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await api.disconnect();
    }
  }
}
```

### 3-2. 설계 결정

| 결정 | 이유 |
|------|------|
| `withRetry`는 `_fetchOnce` 전체를 감쌈 | 연결 자체가 실패해도 재시도 대상에 포함 |
| `finally`에서 `api.disconnect()` | 성공/실패/재시도 모두에서 연결 누수 방지 |
| `data.free.toBigInt() + data.reserved.toBigInt()` | staking locked 잔고 포함한 총 잔고 계산 |
| `rawData`에 원시값 저장 | 디버깅 시 planck 원본값 확인 가능 |

---

## 4. `src/services/reward-calculator.ts` 설계

```typescript
import BigNumber from 'bignumber.js';
import { logger } from '@/utils/logger';

/**
 * Type A 리워드 계산: (오늘 잔고 + 당일 출금액 합산) - 어제 잔고
 *
 * @param todayBalance   - 오늘 잔고 (human 단위 string, e.g. '1.5')
 * @param yesterdayBalance - 어제 잔고 (human 단위 string | null: 최초 실행)
 * @param withdrawals    - 당일 출금액 목록 (human 단위 string[])
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
```

**설계 결정**:
- 입력을 모두 human 단위 string으로 통일 (planck 혼용 방지)
- 음수 리워드 + 출금 없음 → `logger.warn` (경고만, throw 하지 않음)
- `BigNumber.toFixed()` — 지수 표기 없는 string 반환

---

## 5. `src/services/storage.service.ts` 설계

```typescript
import { getDb } from '@/db/client';
import { logger } from '@/utils/logger';
import type { SnapshotData } from '@/fetchers/base.fetcher';

export interface WithdrawalRecord {
  projectId: string;
  withdrawnAt: string;   // "YYYY-MM-DD"
  amount: string;        // human 단위 string
}

export class StorageService {
  async saveSnapshot(data: SnapshotData & { rewardAmount: string | null }): Promise<void> {
    const db = getDb();
    const doc = {
      projectId: data.projectId,
      snapshotDate: data.snapshotDate,
      balance: data.balance ?? null,
      rewardAmount: data.rewardAmount,
      fetchType: data.fetchType,
      updatedAt: new Date(),
    };

    await db.collection('balance_snapshots').replaceOne(
      { projectId: data.projectId, snapshotDate: data.snapshotDate },
      doc,
      { upsert: true },
    );

    logger.info(
      { projectId: data.projectId, snapshotDate: data.snapshotDate, rewardAmount: data.rewardAmount },
      'snapshot saved',
    );
  }

  async getWithdrawals(projectId: string, date: string): Promise<WithdrawalRecord[]> {
    const db = getDb();
    return db
      .collection<WithdrawalRecord>('withdrawal_records')
      .find({ projectId, withdrawnAt: date })
      .toArray();
  }
}
```

**설계 결정**:
- `saveSnapshot` 입력 타입: `SnapshotData & { rewardAmount: string | null }` — 계산 결과 포함
- `replaceOne + upsert: true` — 같은 날 재실행 시 덮어쓰기 (멱등성)
- `getWithdrawals` 반환: `WithdrawalRecord[]` — 빈 배열이면 출금 없음

---

## 6. `src/cli.ts` 설계

```typescript
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { getDb, closeDb } from '@/db/client';
import { AvailFetcher } from '@/fetchers/avail.fetcher';
import { calculateTypeA } from '@/services/reward-calculator';
import { StorageService } from '@/services/storage.service';

// --- CLI 인수 파싱 ---
function parseArgs(argv: string[]): { chain: string; date: string; dryRun: boolean } {
  const args = argv.slice(2);
  const chain = args[args.indexOf('--chain') + 1] ?? 'all';
  const date =
    args[args.indexOf('--date') + 1] ?? new Date().toISOString().slice(0, 10);
  const dryRun = args.includes('--dry-run');
  return { chain, date, dryRun };
}

// --- 단일 체인 실행 ---
async function runChain(chain: string, date: string, dryRun: boolean): Promise<void> {
  const fetcher = new AvailFetcher();   // 추후 chain → fetcher 매핑으로 확장
  const storage = new StorageService();

  const result = await fetcher.fetch(date);
  if (!result.ok) {
    logger.error({ chain, date, error: result.error }, 'fetch failed');
    return;
  }

  const { data } = result;

  // 어제 스냅샷 조회 (리워드 계산용)
  const db = getDb();
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().slice(0, 10);

  const yesterdayDoc = await db
    .collection<{ balance: string }>('balance_snapshots')
    .findOne({ projectId: data.projectId, snapshotDate: yesterdayDate });

  const withdrawals = await storage.getWithdrawals(data.projectId, date);
  const withdrawalAmounts = withdrawals.map((w) => w.amount);

  const rewardAmount = calculateTypeA(
    data.balance ?? '0',
    yesterdayDoc?.balance ?? null,
    withdrawalAmounts,
  );

  logger.info({ chain, date, balance: data.balance, rewardAmount }, 'result');

  if (dryRun) {
    console.log(JSON.stringify({ chain, date, balance: data.balance, rewardAmount }, null, 2));
    return;
  }

  await storage.saveSnapshot({ ...data, rewardAmount });
}

// --- 진입점 ---
async function main(): Promise<void> {
  const { chain, date, dryRun } = parseArgs(process.argv);
  logger.info({ chain, date, dryRun }, 'cli started');

  try {
    if (chain === 'avail' || chain === 'all') {
      await runChain('avail', date, dryRun);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  logger.error({ err }, 'cli fatal error');
  process.exit(1);
});
```

**설계 결정**:
- `process.argv` 직접 파싱 — 외부 라이브러리 의존성 없음
- `finally { closeDb() }` — 정상/에러 모두에서 MongoDB 연결 종료
- `--chain all` 이 기본값 — 추후 복수 체인 추가 시 확장 용이
- `--dry-run` 시 `console.log(JSON.stringify(...))` — 구조화된 출력

---

## 7. 테스트 설계

### 7-1. `tests/fetchers/avail.fetcher.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiPromise, WsProvider } from '@polkadot/api';

vi.mock('@polkadot/api', () => ({
  ApiPromise: { create: vi.fn() },
  WsProvider: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: {
    AVAIL_RPC_URL: 'wss://avail-test.example.com',
    AVAIL_WALLET_ADDRESS: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  },
}));

const mockAccount = vi.fn().mockResolvedValue({
  data: {
    free:     { toBigInt: () => 1_000_000_000_000_000_000n },
    reserved: { toBigInt: () =>                          0n },
  },
});
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockApi = {
  query: { system: { account: mockAccount } },
  disconnect: mockDisconnect,
};

describe('AvailFetcher', () => {
  beforeEach(() => {
    vi.mocked(ApiPromise.create).mockResolvedValue(mockApi as never);
    mockAccount.mockClear();
    mockDisconnect.mockClear();
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

    // 성공 케이스
    await fetcher.fetch('2026-03-19');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);

    mockDisconnect.mockClear();
    mockAccount.mockRejectedValue(new Error('fail'));

    // 실패 케이스
    await fetcher.fetch('2026-03-19');
    expect(mockDisconnect).toHaveBeenCalledTimes(3); // 재시도 3회 × disconnect
  });
});
```

### 7-2. `tests/services/reward-calculator.test.ts`

```typescript
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
```

### 7-3. `tests/services/storage.service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReplaceOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
const mockFind = vi.fn();
const mockCollection = vi.fn().mockReturnValue({
  replaceOne: mockReplaceOne,
  find: mockFind,
});

vi.mock('@/db/client', () => ({
  getDb: vi.fn().mockReturnValue({ collection: mockCollection }),
}));

describe('StorageService', () => {
  beforeEach(() => {
    mockReplaceOne.mockClear();
    mockFind.mockClear();
    mockFind.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
  });

  it('saveSnapshot 호출 시 upsert: true 옵션 전달', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    await service.saveSnapshot({
      projectId: 'avail',
      snapshotDate: '2026-03-19',
      balance: '1000000000000000000',
      rewardAmount: '1',
      fetchType: 'A',
    });

    expect(mockReplaceOne).toHaveBeenCalledWith(
      { projectId: 'avail', snapshotDate: '2026-03-19' },
      expect.objectContaining({ projectId: 'avail', balance: '1000000000000000000' }),
      { upsert: true },
    );
  });

  it('getWithdrawals — 올바른 filter 전달', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    await service.getWithdrawals('avail', '2026-03-19');

    expect(mockFind).toHaveBeenCalledWith({ projectId: 'avail', withdrawnAt: '2026-03-19' });
  });

  it('getWithdrawals — 결과 없으면 빈 배열 반환', async () => {
    const { StorageService } = await import('@/services/storage.service');
    const service = new StorageService();
    const result = await service.getWithdrawals('avail', '2026-03-19');

    expect(result).toEqual([]);
  });
});
```

---

## 8. 완료 기준 (Definition of Done)

- [ ] `npm run cli -- --chain avail --dry-run` 에러 없이 JSON 결과 출력
- [ ] `avail.fetcher.test.ts` 4개 케이스 통과
- [ ] `reward-calculator.test.ts` 4개 케이스 통과
- [ ] `storage.service.test.ts` 3개 케이스 통과
- [ ] `api.disconnect()` 성공·실패 모두 호출 확인
- [ ] `npm run build` 에러 없이 통과
- [ ] `npm test` 총 25개 이상 통과

---

## 9. 구현 순서

1. `src/services/reward-calculator.ts` — 순수 함수, 의존성 없음
2. `src/services/storage.service.ts` — DB 의존
3. `src/fetchers/avail.fetcher.ts` — RPC + retry + toHuman
4. `src/cli.ts` — 전체 파이프라인 조합
5. `tests/services/reward-calculator.test.ts`
6. `tests/services/storage.service.test.ts`
7. `tests/fetchers/avail.fetcher.test.ts`

---

## 10. 다음 Phase 연계

이 Design 완료 후 → **구현 (`/pdca do avail-fetcher`)**:
구현 순서(섹션 9)를 따라 파일별로 작성.
`@polkadot/api` codec 타입 오류 발생 시 `codec.toString()` + `BigInt()` 변환으로 대체.
