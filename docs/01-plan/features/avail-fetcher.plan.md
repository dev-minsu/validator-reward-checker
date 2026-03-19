# Plan: Phase 1-4/1-5/1-6 — Avail Fetcher + CLI + 테스트

> **Feature**: `avail-fetcher`
> **Phase**: Plan
> **작성일**: 2026-03-19
> **참고 문서**: [PRD.md](../../PRD.md) | [ARCHITECTURE.md](../../ARCHITECTURE.md) | [TASK.md](../../TASK.md)

---

## 1. 목표 (Objective)

7개 체인 중 첫 번째인 **Avail (Type A — Balance Diff)** 리워드 수집 파이프라인을 완성한다.
Avail fetcher, 리워드 계산 서비스, MongoDB 저장 서비스, CLI 진입점을 구현하여
`npm run cli -- --chain avail --date 2026-03-19` 로 단일 체인 리워드 수집이
End-to-End로 동작하는 상태를 만든다.

---

## 2. 배경 및 이유 (Background)

- Phase 1-3에서 `IFetcher`, `withRetry`, `toHuman`, `logger`, `env` 모두 완성된 상태
- Avail은 Substrate 기반 체인 — `@polkadot/api` 의 `ApiPromise` 로 WebSocket RPC 접속
- Type A 리워드 공식: `(오늘 잔고 + 당일 출금액 합산) - 어제 잔고`
- 최초 실행 시 어제 스냅샷이 없으므로 `reward = null` 처리 필요
- CLI를 통해 특정 날짜/체인 수동 재처리 + dry-run 검증이 가능해야 함

---

## 3. 범위 (Scope)

### In Scope

| 파일 | 설명 |
|------|------|
| `src/fetchers/avail.fetcher.ts` | Substrate RPC로 잔고 조회, `IFetcher` 구현 |
| `src/services/reward-calculator.ts` | Type A 리워드 계산 (`calculateTypeA`) |
| `src/services/storage.service.ts` | `balance_snapshots` upsert, `withdrawal_records` 조회 |
| `src/cli.ts` | `--chain`, `--date`, `--dry-run` 옵션 CLI |
| `tests/fetchers/avail.fetcher.test.ts` | polkadot.js mock, 잔고 변환, 재시도, disconnect 확인 |
| `tests/services/reward-calculator.test.ts` | Type A 계산, 출금 보정, 최초 실행, 경고 로그 |

### Out of Scope

- Type B, Type C Fetcher — Phase 2, 3에서 처리
- Slack / Google Sheets 연동 — Phase 4에서 처리
- 크론 스케줄러 (`src/index.ts`) — Phase 4에서 처리
- `storage.service.ts` 단위 테스트 — MongoDB mock이 복잡하므로 Phase 5 통합 테스트에서 처리

---

## 4. 요구사항 (Requirements)

### 기능 요구사항

| ID | 요구사항 |
|----|----------|
| R-01 | `AvailFetcher`는 `IFetcher` 인터페이스를 구현해야 함 (`projectName = 'avail'`, `fetchType = 'A'`) |
| R-02 | `ApiPromise.create({ provider: WsProvider(env.AVAIL_RPC_URL) })` 로 연결해야 함 |
| R-03 | `api.query.system.account(env.AVAIL_WALLET_ADDRESS)` 로 잔고 조회 (`data.free + data.reserved`) |
| R-04 | 잔고를 planck string으로 보관하고, `toHuman(planck, 18)` 으로 변환한 값도 함께 반환해야 함 |
| R-05 | 작업 완료 후 반드시 `api.disconnect()` 호출 (연결 누수 방지) |
| R-06 | `withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 })` 적용 |
| R-07 | `calculateTypeA(today, yesterday, withdrawals)` 는 `(today + withdrawals) - yesterday` 를 반환 |
| R-08 | 어제 스냅샷이 없는 경우 `rewardAmount = null` 반환 |
| R-09 | `StorageService.saveSnapshot()` 은 `balance_snapshots` 에 upsert 처리 |
| R-10 | CLI는 `--chain avail`, `--date YYYY-MM-DD`, `--dry-run` 옵션을 지원해야 함 |
| R-11 | `--dry-run` 시 DB 저장 없이 결과를 콘솔에 출력해야 함 |

### 비기능 요구사항

| ID | 요구사항 |
|----|----------|
| NR-01 | `api.disconnect()` 는 성공/실패 모두에서 반드시 호출 (finally 블록 사용) |
| NR-02 | 잔고는 MongoDB 저장 시 `string` 타입 유지 (부동소수점 금지) |
| NR-03 | TypeScript `strict: true` 준수 — `any` 사용 금지 |

---

## 5. 기술 결정 사항 (Technical Decisions)

### 5-1. avail.fetcher.ts — 연결 방식

```typescript
const provider = new WsProvider(env.AVAIL_RPC_URL);
const api = await ApiPromise.create({ provider });
try {
  const { data } = await api.query.system.account(env.AVAIL_WALLET_ADDRESS);
  const planck = (data.free.toBigInt() + data.reserved.toBigInt()).toString();
  const balance = toHuman(planck, 18);
  return { ok: true, data: { projectId: 'avail', snapshotDate: date, balance: planck, fetchType: 'A' } };
} catch (error) {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
} finally {
  await api.disconnect();
}
```

- `data.free + data.reserved` 합산 → 총 잔고 (staking locked 포함)
- BigInt 연산 후 `toString()` — number 변환 없이 정밀도 유지

### 5-2. reward-calculator.ts — Type A 계산

```typescript
export function calculateTypeA(
  todayBalance: string,
  yesterdayBalance: string | null,
  withdrawals: string[],   // 당일 출금액 목록 (human 단위 string)
): string | null {
  if (yesterdayBalance === null) return null;  // 최초 실행

  const today = new BigNumber(todayBalance);
  const yesterday = new BigNumber(yesterdayBalance);
  const totalWithdrawal = withdrawals.reduce(
    (sum, w) => sum.plus(new BigNumber(w)),
    new BigNumber(0),
  );
  return today.plus(totalWithdrawal).minus(yesterday).toFixed();
}
```

### 5-3. storage.service.ts — upsert 패턴

```typescript
await db.collection('balance_snapshots').replaceOne(
  { projectId, snapshotDate },
  { projectId, snapshotDate, balance, rewardAmount, fetchType, updatedAt: new Date() },
  { upsert: true },
);
```

### 5-4. cli.ts — 인수 파싱

Node.js 기본 `process.argv` 파싱 (외부 라이브러리 없이):
- `--chain avail` → 특정 체인만 실행
- `--date 2026-03-19` → 날짜 지정 (기본값: 오늘 `new Date().toISOString().slice(0, 10)`)
- `--dry-run` → DB 저장 건너뜀

---

## 6. 파일 목록 (Deliverables)

| 파일 | 유형 | 설명 |
|------|------|------|
| `src/fetchers/avail.fetcher.ts` | 신규 | Avail RPC fetcher (`IFetcher` 구현) |
| `src/services/reward-calculator.ts` | 신규 | Type A 리워드 계산 함수 |
| `src/services/storage.service.ts` | 신규 | MongoDB upsert + 출금 조회 |
| `src/cli.ts` | 신규 | CLI 진입점 |
| `tests/fetchers/avail.fetcher.test.ts` | 신규 | Avail fetcher 단위 테스트 (4 케이스) |
| `tests/services/reward-calculator.test.ts` | 신규 | 리워드 계산 단위 테스트 (4 케이스) |
| `tests/services/storage.service.test.ts` | 신규 | MongoDB collection mock, upsert/조회 검증 (3 케이스) |

> `src/cli.ts` 단위 테스트는 `process.argv` 조작 복잡도가 높아 Out of Scope. `--dry-run` 으로 E2E 검증 대체.

---

## 7. 완료 기준 (Definition of Done)

- [ ] `npm run cli -- --chain avail --dry-run` 실행 시 에러 없이 결과 출력
- [ ] `avail.fetcher.test.ts` — 4개 케이스 통과 (정상 조회, planck 변환, 재시도 3회, disconnect 호출)
- [ ] `reward-calculator.test.ts` — 4개 케이스 통과 (기본 계산, 출금 보정, 최초 실행, 음수 리워드)
- [ ] `storage.service.test.ts` — 3개 케이스 통과 (upsert 옵션, 출금 조회 filter, 빈 배열 반환)
- [ ] `api.disconnect()` 는 성공/실패 모두에서 호출됨이 테스트로 확인
- [ ] `npm run build` 에러 없이 통과
- [ ] `npm test` 전체 테스트 통과 (기존 14개 + 신규 11개 = 25개 이상)

---

## 8. 테스트 설계

### 8-1. `tests/fetchers/avail.fetcher.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { AvailFetcher } from '@/fetchers/avail.fetcher';

vi.mock('@polkadot/api', () => ({
  ApiPromise: { create: vi.fn() },
  WsProvider: vi.fn(),
}));

const mockApi = {
  query: {
    system: {
      account: vi.fn().mockResolvedValue({
        data: {
          free:     { toBigInt: () => 1_000_000_000_000_000_000n },
          reserved: { toBigInt: () =>                          0n },
        },
      }),
    },
  },
  disconnect: vi.fn().mockResolvedValue(undefined),
};
```

| # | 케이스 | 검증 포인트 |
|---|--------|------------|
| 1 | 정상 잔고 조회 | `result.ok === true`, `data.balance === '1000000000000000000'` |
| 2 | planck → AVAIL 변환 | `toHuman(data.balance, 18) === '1'` |
| 3 | RPC 오류 시 재시도 3회 후 `ok: false` | `mockAccount` 3회 호출, `result.error` 존재 |
| 4 | 성공·실패 모두 `api.disconnect()` 호출 | `mockApi.disconnect` toHaveBeenCalledTimes(1) |

---

### 8-2. `tests/services/reward-calculator.test.ts`

순수 함수 — mock 없음, 입출력 값 검증만

| # | 케이스 | today | yesterday | withdrawals | 예상 출력 |
|---|--------|-------|-----------|-------------|-----------|
| 1 | 기본 계산 | `'2'` | `'1'` | `[]` | `'1'` |
| 2 | 출금 보정 | `'1'` | `'2'` | `['1.5']` | `'0.5'` |
| 3 | 최초 실행 | `'1'` | `null` | `[]` | `null` |
| 4 | 음수 리워드 (잔고 감소, 출금 없음) | `'0.5'` | `'1'` | `[]` | `'-0.5'` |

---

### 8-3. `tests/services/storage.service.test.ts`

```typescript
vi.mock('@/db/client', () => ({
  getDb: vi.fn().mockReturnValue({
    collection: vi.fn().mockReturnValue({
      replaceOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    }),
  }),
}));
```

| # | 케이스 | 검증 포인트 |
|---|--------|------------|
| 1 | `saveSnapshot` 호출 시 upsert 옵션 전달 | `replaceOne` 세 번째 인수에 `{ upsert: true }` |
| 2 | `getWithdrawals` 올바른 filter 전달 | `find` 호출 인수 `{ projectId, withdrawnAt: date }` |
| 3 | `getWithdrawals` 결과 없으면 빈 배열 | 반환값 `[]` |

---

## 9. 리스크 및 고려사항

| 리스크 | 대응 |
|--------|------|
| `@polkadot/api` 타입이 복잡하여 mock 작성 난이도 높음 | `vi.mock('@polkadot/api')` + 최소한의 응답 객체만 stub |
| `data.free.toBigInt()` 호출 시 타입 오류 가능 | `codec.toBigInt()` 타입 확인 후 필요 시 `codec.toString()` + BigInt 변환으로 대체 |
| CLI에서 `env.ts` import 시 모든 환경 변수 필수 검증 | `--dry-run` 이라도 env 검증은 동일하게 수행 (설계 일관성 유지) |

---

## 10. 구현 순서

1. `src/services/reward-calculator.ts` — 순수 함수, 의존성 없음
2. `src/services/storage.service.ts` — DB 의존, env 사용
3. `src/fetchers/avail.fetcher.ts` — RPC, retry, toHuman 의존
4. `src/cli.ts` — 위 모든 모듈 조합
5. `tests/services/reward-calculator.test.ts`
6. `tests/fetchers/avail.fetcher.test.ts`

---

## 11. 다음 Phase 연계

이 Phase 완료 후 → **Phase 2 (Type B Fetchers)**:
- `src/fetchers/stacks.fetcher.ts` (Hiro REST API)
- `src/fetchers/story.fetcher.ts` (Cosmos SDK staking REST)
- `src/fetchers/hyperliquid.fetcher.ts` (자체 REST API)
