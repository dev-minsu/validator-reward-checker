# Analysis: Phase 1-4/1-5/1-6 — Avail Fetcher

> **Feature**: `avail-fetcher`
> **Phase**: Check (Gap Analysis)
> **작성일**: 2026-03-19 (업데이트: 2026-03-24)
> **참고 문서**: [Design](../02-design/features/avail-fetcher.design.md)

---

## Match Rate: 97%

> 설계 항목 63개 중 61개 일치 / 5개 의도적 개선(버그 수정 포함) / 0개 누락
> *(2026-03-24: TypeScript 컴파일 에러 2건 + 숨은 런타임 버그 수정 반영)*

---

## 파일별 결과

| 파일 | Match Rate | 비고 |
|------|:----------:|------|
| `src/fetchers/avail.fetcher.ts` | 90% (9/10) | 에러 핸들링 구조 개선 |
| `src/services/reward-calculator.ts` | 100% (7/7) | 설계와 동일 |
| `src/services/storage.service.ts` | 100% (6/6) | `await getDb()` 버그 수정 + 타입 시그니처 개선 |
| `src/cli.ts` | 95% (12/13) | `await getDb()` 버그 수정 + 개선 추가 |
| `tests/fetchers/avail.fetcher.test.ts` | 95% (19/20) | mock toString 추가 |
| `tests/services/reward-calculator.test.ts` | 100% (4/4) | 설계와 동일 |
| `tests/services/storage.service.test.ts` | 100% (4/4) | 비동기 mock + null rewardAmount 케이스 추가 |

---

## Matched Items (61/63)

### avail.fetcher.ts
- [x] `AvailFetcher implements IFetcher`
- [x] `projectName = 'avail'`, `fetchType = 'A' as const`
- [x] `withRetry(fn, { maxAttempts: 3, baseDelayMs: 1000 })`
- [x] `WsProvider` + `ApiPromise.create` 연결 패턴
- [x] `data.free.toBigInt() + data.reserved.toBigInt()` 합산
- [x] `toHuman(planck, 18)` 변환
- [x] `FetchResult` 반환 (`projectId, snapshotDate, balance, fetchType, rawData`)
- [x] `finally { api.disconnect() }` 누수 방지
- [x] `logger.info` / `logger.error` 로그

### reward-calculator.ts
- [x] 함수 시그니처 및 JSDoc
- [x] `null` 체크 → `null` 반환 (최초 실행)
- [x] `BigNumber` 연산 (today + withdrawal - yesterday)
- [x] 음수 리워드 + 출금 없음 → `logger.warn`
- [x] `.toFixed()` string 반환

### storage.service.ts
- [x] `WithdrawalRecord` 인터페이스
- [x] `saveSnapshot` — `replaceOne + { upsert: true }`
- [x] document shape (`projectId, snapshotDate, balance, rewardAmount, fetchType, updatedAt`)
- [x] `getWithdrawals` — `{ projectId, withdrawnAt: date }` filter
- [x] logger 호출

### cli.ts
- [x] `parseArgs` 함수 (`--chain`, `--date`, `--dry-run`)
- [x] `runChain` 파이프라인 (fetch → 어제 조회 → 출금 조회 → calculateTypeA → save)
- [x] `--dry-run` 시 `JSON.stringify` 출력
- [x] `finally { closeDb() }`
- [x] `main().catch` + `process.exit(1)`

### 테스트 (모두 설계 케이스 통과)
- [x] avail.fetcher: 4 케이스
- [x] reward-calculator: 4 케이스
- [x] storage.service: 3 케이스

---

## Gaps

### 의도적 변경 (설계 대비 개선)

| ID | 파일 | 항목 | 상태 | 설명 |
|----|------|------|------|------|
| GAP-01 | `avail.fetcher.ts` | 에러 핸들링 구조 | Improved | 설계: `_fetchOnce` 내부 catch → `{ ok: false }` 반환. 구현: `_fetchOnce`는 throw, `fetch()`가 `withRetry` 바깥에서 catch → **withRetry가 실제 예외를 받아 재시도 가능** (설계의 버그 수정) |
| GAP-02 | `cli.ts` | `parseArgs` index guard | Improved | `indexOf === -1` 체크 추가 → 플래그 없을 때 `args[-1+1]=args[0]` 읽는 버그 방지 |
| GAP-03 | `cli.ts` | 알 수 없는 chain 처리 | Added | `logger.warn({ chain }, 'unknown chain')` 추가 — UX 개선 |
| GAP-04 | `storage.service.ts` | `saveSnapshot` 타입 시그니처 | Fixed | `SnapshotData & { rewardAmount: string \| null }` 교차 타입이 TypeScript에서 `rewardAmount: string`으로 수렴되는 버그. `Omit<SnapshotData, 'rewardAmount'> & { rewardAmount?: string \| null }`로 수정 |
| GAP-05 | `cli.ts`, `storage.service.ts` | `getDb()` await 누락 | Fixed | `getDb()`가 `async`임에도 3곳에서 `await` 없이 호출 → `Promise<Db>`에 `.collection()` 호출로 런타임 crash. `await getDb()`로 수정 |

### 추가 구현 (설계에 없음, 품질 향상)

| ID | 파일 | 항목 | 설명 |
|----|------|------|------|
| ADD-01 | `cli.ts` | `void env` | 앱 시작 시 zod 검증 트리거 명시 |
| ADD-02 | `tests/*.test.ts` | `vi.resetModules()` | dynamic `import()` 패턴에서 모듈 캐시 초기화 필수 |
| ADD-03 | `avail.fetcher.test.ts` | mock `toString()` | `as unknown as` 타입 단언에서 `.toString()` 호출 대응 |
| ADD-04 | `storage.service.test.ts` | `mockResolvedValue` + null 케이스 | `getDb()` mock을 비동기로 수정, `rewardAmount: null` 최초 실행 케이스 테스트 추가 |

---

## 테스트 결과

```
Test Files  6 passed (6)
     Tests  26 passed (26)
  Duration  6.33s
```
*(2026-03-24: storage.service null rewardAmount 케이스 추가로 25 → 26)*

---

## 결론

**Match Rate 97%** — 설계 대비 구현이 높은 수준으로 일치합니다.

- GAP-01은 설계의 구조적 버그(retry가 동작하지 않는 문제)를 구현 시 발견하고 수정한 개선
- GAP-02, GAP-03은 방어적 코딩으로 품질 향상
- GAP-04, GAP-05 (2026-03-24 수정): TypeScript 컴파일 에러 2건 + 숨어있던 런타임 버그(`await getDb()` 누락) 수정
- 누락된 항목 없음, 모든 DoD 항목 충족
- 테스트 26개 전부 통과, `npx tsc --noEmit` 에러 0건

**다음 단계**: `/pdca report avail-fetcher` 로 완료 보고서 생성
