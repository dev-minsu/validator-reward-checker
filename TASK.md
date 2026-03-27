# Validator Reward Updater — TASK

> 현재 Phase: **Phase 1 — 프로젝트 설정 + Avail Fetcher (Type A)**
> 참고: [PRD.md](./PRD.md) | [ARCHITECTURE.md](./ARCHITECTURE.md) | [CLAUDE.md](./CLAUDE.md)

---

## Phase 1: 프로젝트 초기 설정 + Avail Fetcher

### 1-1. 프로젝트 기반 설정 ✅ (2026-03-18 완료, Match Rate 97%)

- [x] `package.json` 초기화 (Node.js 20, TypeScript)
- [x] `tsconfig.json` 설정 (`strict: true`, path alias `@/` → `src/`)
- [x] ESLint + Prettier 설정 (`eslint.config.cjs`, `.prettierrc`)
- [x] `.env.example` 작성 (ARCHITECTURE.md 환경 변수 목록 기준, 17개 변수)
- [x] `.gitignore` 작성 (`.env`, `dist/`, `node_modules/` 포함)
- [x] 의존성 설치
  - runtime: `@polkadot/api`, `mongodb`, `node-cron`, `pino`, `bignumber.js`, `zod`
  - dev: `typescript`, `vitest`, `ts-node`, `@types/node`, `tsconfig-paths`, `eslint`, `prettier`

---

### 1-2. DB 설정 ✅ (2026-03-18 완료, Match Rate 100%)

- [x] `src/db/client.ts` — MongoDB 연결 (`MongoClient`, `MONGO_DB_URI` 환경 변수 사용)
- [x] `src/db/seed.ts` 작성
  - `validator_projects` 컬렉션 인덱스 없음 (기본 `_id`)
  - `balance_snapshots` unique index: `{ projectId: 1, snapshotDate: 1 }`
  - `token_transfer_snapshots` unique index: `{ projectId: 1, snapshotDate: 1, tokenSymbol: 1 }`
  - `withdrawal_records` index: `{ projectId: 1, withdrawnAt: -1 }`
- [x] `npm run db:init` 스크립트 작성 (seed.ts 실행)
- [x] `validator_projects` 시드 데이터 삽입 (7개 체인 초기 데이터)
- [x] `tests/db/client.test.ts`
  - `vi.mock('mongodb')`로 MongoClient mock
  - `getDb()` 첫 호출 시 `connect()` 호출 확인
  - `getDb()` 재호출 시 동일 인스턴스 반환 (싱글톤)
  - `closeDb()` 후 `close()` 호출 + `_client = null` 초기화

> `seed.ts` 단위 테스트는 MongoDB 없이 의미 있는 작성이 어려우므로 Phase 5 통합 테스트에서 처리.

---

### 1-3. 공통 인프라 ✅ (2026-03-19 완료, Match Rate 97%)

- [x] `src/utils/logger.ts` — pino 기반 구조화 로그
- [x] `src/utils/retry.ts` — `withRetry(fn, { maxAttempts, baseDelayMs })` 구현
- [x] `src/utils/bignum.ts` — `toHuman(planck, decimals)` 단위 변환 유틸
- [x] `src/fetchers/base.fetcher.ts` — `IFetcher` 인터페이스 + `FetchResult` 타입 정의
- [x] `src/config/env.ts` — zod로 환경 변수 파싱 + 유효성 검증
- [x] `tests/utils/retry.test.ts`
  - 1회 성공 시 즉시 반환
  - N회 실패 후 성공 시 정상 반환
  - maxAttempts 초과 시 마지막 에러 throw
  - `vi.useFakeTimers()`로 baseDelayMs 간격 검증
- [x] `tests/utils/bignum.test.ts`
  - `toHuman('1000000000000000000', 18)` → `'1'`
  - `toHuman('1500000000000000000', 18)` → `'1.5'`
  - 부동소수점 오차 없이 string 반환 검증
- [x] `tests/config/env.test.ts`
  - 필수 환경 변수 누락 시 zod 에러 throw
  - 유효한 환경 변수 세트로 정상 파싱 확인

---

### 1-4. Avail Fetcher 구현 (Type A — Balance Diff) ✅ (2026-03-24 완료, Match Rate 97%)

> Avail은 Substrate 기반 체인. `@polkadot/api` 의 `ApiPromise` 로 접속하여
> `api.query.system.account(address)` 로 잔고를 조회한다.

- [x] `src/fetchers/avail.fetcher.ts` 작성
  - [x] `ApiPromise.create({ provider: WsProvider(AVAIL_RPC_URL) })` 로 연결
  - [x] `api.query.system.account(AVAIL_WALLET_ADDRESS)` 호출
  - [x] `data.free` + `data.reserved` 합산 → 총 잔고 (planck 단위)
  - [x] planck → AVAIL 변환: `bignumber.js` 사용, `÷ 10^18`
  - [x] 작업 완료 후 `api.disconnect()` 호출 (연결 누수 방지)
  - [x] `FetchResult` 형태로 반환 (`fetchType: 'A'`)
  - [x] `withRetry()` 적용 (최대 3회)

- [x] `src/services/reward-calculator.ts` — Type A 리워드 계산
  - [x] `calculateTypeA(today, yesterday, withdrawals): rewardAmount`
  - [x] 공식: `(오늘 잔고 + 당일 출금액 합산) - 어제 잔고`
  - [x] 어제 스냅샷이 없는 경우(최초 실행): `reward = null` 처리

- [x] `src/services/storage.service.ts` — DB 저장
  - [x] `balance_snapshots` upsert (`replaceOne({ projectId, snapshotDate }, doc, { upsert: true })`)
  - [x] `withdrawal_records` 조회 (당일 출금 보정용, `find({ projectId, withdrawnAt: date })`)
  - [x] TypeScript 타입 시그니처 수정 (GAP-04: rewardAmount union 타입 정확성)
  - [x] `await getDb()` 버그 수정 (GAP-05: async/await 누락 3곳)

---

### 1-5. CLI 수동 실행 ✅ (2026-03-24 완료, Match Rate 97%)

- [x] `src/cli.ts` 작성
  - [x] `--chain avail` 옵션으로 특정 체인만 실행
  - [x] `--date 2025-03-17` 옵션으로 특정 날짜 지정 (기본값: 오늘)
  - [x] `--dry-run` 옵션: DB 저장 없이 결과만 출력
  - [x] `parseArgs` index guard 개선 (GAP-02: indexOf !== -1 체크)
  - [x] 미확인 체인 처리 추가 (GAP-03: logger.warn)
  - [x] `await getDb()` 버그 수정 (GAP-05)

  ```bash
  # 사용 예시
  npm run cli -- --chain avail --date 2025-03-17
  npm run cli -- --chain avail --dry-run
  ```

---

### 1-6. 단위 테스트 ✅ (2026-03-24 완료, Match Rate 97%, 26/26 cases passed)

- [x] `tests/fetchers/avail.fetcher.test.ts` (4 cases)
  - [x] polkadot.js `ApiPromise` mock 처리
  - [x] 정상 잔고 조회 → planck → AVAIL 변환 검증
  - [x] RPC 오류 시 재시도 로직 동작 확인
  - [x] `api.disconnect()` 호출 여부 확인

- [x] `tests/services/reward-calculator.test.ts` (4 cases)
  - [x] Type A 기본 계산 (`reward = today - yesterday`)
  - [x] 출금 보정 (`reward = (today + withdrawal) - yesterday`)
  - [x] 최초 실행 (어제 스냅샷 없음) → `reward = null`
  - [x] 잔고가 줄었을 때 출금 기록 없으면 경고 로그

- [x] `tests/services/storage.service.test.ts` (4+ cases)
  - [x] `saveSnapshot` 호출 시 upsert: true 옵션 전달
  - [x] `getWithdrawals` 올바른 filter 전달
  - [x] `getWithdrawals` 결과 없으면 빈 배열 반환
  - [x] `rewardAmount: null` 첫 실행 케이스 추가 (GAP-05 관련)
  - [x] 비동기 mock 동기화 (getDb() async 처리)

---

### 1-7. seed-balance (Avail 과거 잔고 시드) ✅ (2026-03-24 완료, Match Rate 100%)

- [x] `src/db/seed.ts` — `BalanceSnapshotSeed` 인터페이스 추가
- [x] `src/db/seed.ts` — `seedBalanceSnapshot()` 함수 추가 (replaceOne upsert)
- [x] `main()` 호출 추가 — `npm run db:init` 실행 시 avail 2026-02-26 잔고 삽입
- [x] 삽입 Document: `{ projectId: 'avail', snapshotDate: '2026-02-26', balance: '648173780900000000000000', rewardAmount: null, fetchType: 'A' }`

---

### 1-8. monthly-reward (월단위 리워드 계산) ✅ (2026-03-24 완료, Match Rate 100%)

- [x] `src/config/env.ts` — `REWARD_CYCLE_DAY` 추가 (기본 26, 범위 1~28)
- [x] `src/services/storage.service.ts` — `getSnapshot()` 헬퍼 추가, `getWithdrawals()` 날짜 범위로 변경
- [x] `src/cli.ts` — 기준일 판별(`isMonthlyDate`), 이전 기준일 계산, 월단위 출금 집계
- [x] `.env.example` — `REWARD_CYCLE_DAY=26` 추가
- [x] 테스트 44 cases 전체 통과

---

### Phase 2: 리포트 시스템 (avail-redesign)

> 설계: [docs/01-plan/features/avail-redesign.plan.md](./docs/01-plan/features/avail-redesign.plan.md)

#### 2-1. 환경 변수 + 유틸리티 ✅ (2026-03-25 완료, Match Rate 96%)

- [x] `src/config/env.ts` — `BALANCE_COLLECTION_CRON`, `REPORT_CRON`, `REPORT_DEFAULT_START_DAY`, `AVAIL_SUBSCAN_API_KEY`, `SLACK_WEBHOOK_URL` 추가
- [x] `src/utils/date.ts` — `kstDateToUtc`, `utcToKstDateStr`, `toPeriodKey`, `getDefaultPeriod` 구현
- [x] `.env.example` — 신규 변수 5개 추가

#### 2-2. StorageService 확장 ✅ (2026-03-25 완료, Match Rate 96%)

- [x] `src/services/storage.service.ts`
  - [x] `saveBalanceHistory(data)` — `balance_history` upsert (TTL 90일)
  - [x] `getSnapshotAt(projectId, beforeOrAt: Date)` — 경계시각 이전 최신 스냅샷 조회
- [x] `src/db/seed.ts` — `balance_history` TTL 인덱스, `reward_reports` 인덱스, `indexer_query_cache` 인덱스 추가

#### 2-3. IndexerService (Subscan API + DB 캐시) ✅ (2026-03-25 완료, Match Rate 96%)

- [x] `src/services/indexer.service.ts`
  - [x] `fetchWithdrawals(projectId, periodStart, periodEnd)` 구현
  - [x] `indexer_query_cache` 기준 캐시 조회 (빈 결과 포함 재호출 방지)
  - [x] Subscan API 호출 → `withdrawal_records` 저장 (rawResponse 포함)
  - [x] `withRetry()` 적용 (최대 3회), MAX_PAGES=100 가드
  - [x] `indexer_query_cache` upsert (count=0인 빈 결과도 저장)
- [x] `tests/services/indexer.service.test.ts` (5 케이스: 캐시히트/빈캐시히트/API호출/0건저장/재호출방지)

#### 2-4. ReportService (월단위 리포트 + CSV) ✅ (2026-03-25 완료, Match Rate 96%)

- [x] `src/services/report.service.ts`
  - [x] `generate(projectId, periodStart, periodEnd, {dryRun?})` — 경계 잔고 조회 + 인출 집계 + 계산
  - [x] `rewardAmount = (balanceEnd + totalWithdrawals) − balanceStart` (BigNumber.js)
  - [x] `reward_reports` 저장 (version increment), dryRun 시 저장 생략
  - [x] `toCsv(report)` — CSV 문자열 생성
- [x] `tests/services/report.service.test.ts` (5 케이스)

#### 2-5. SlackService (알림) ✅ (2026-03-25 완료, Match Rate 96%)

- [x] `src/services/slack.service.ts`
  - [x] `sendReport(report, tokenSymbol, decimals)` — toHuman() 변환 후 리포트 알림
  - [x] `sendError(chain, error)` — 에러 알림
- [x] `tests/services/slack.service.test.ts` (2 케이스)

#### 2-6. 통합 스케줄러 + CLI 확장 ✅ (2026-03-25 완료, Match Rate 96%)

- [x] `src/index.ts` — 잔고 수집 cron + 리포트 cron 통합 (독립 실행, SIGTERM 처리)
- [x] `src/cli.ts`
  - [x] `--collect` 커맨드 추가
  - [x] `--report [--beg DATE] [--end DATE] [--dry-run]` 커맨드 추가
  - [x] `--add-balance --chain --time --balance` 커맨드 추가
- [x] `package.json` — `collect` 스크립트 추가 (`npm run collect -- --chain avail`)

#### 2-7. 문서 + 테스트 ✅ (2026-03-25 완료, Match Rate 96%)

- [x] `README.md` — Subscan API 키 발급 절차 추가
- [x] `npm test` 전체 통과 확인 (67 tests passing)
- [x] `npx tsc --noEmit` 에러 없음 확인
- [x] 완료 보고서: `docs/04-report/avail-redesign.report.md`


<!-- ## 백로그   -->
<!-- ### Phase 3: Type C Fetchers
- [ ] Story Fetcher (Cosmos SDK staking REST)
- [ ] EVM Transfer 공통 베이스 (`src/fetchers/evm-transfer.fetcher.ts`)
  - ethers.js `provider.getLogs()` + ERC-20 Transfer 이벤트 필터
  - 날짜 → 블록 범위 변환 로직
  - tx_hash 기준 dedup 처리
- [ ] Bera Fetcher (BGT Reward Vault 이벤트)
- [ ] Infrared Fetcher (iBERA ERC-20 Transfer)
- [ ] Monad Fetcher (MON ERC-20 Transfer, 테스트넷)

## Phase 4: Type D Fetchers
- [ ] Stacks Fetcher
- [ ] Hyperliquid Fetcher (자체 REST API) -->


<!-- ### Phase 6: 안정화
- [ ] 통합 테스트 (실제 RPC 연결, --dry-run 모드)
- [ ] 출금 내역 등록 CLI (`npm run cli -- --add-withdrawal`)
- [ ] 과거 날짜 재처리 배치 스크립트
- [ ] 헬스체크 + 모니터링 알림 (연속 실패 N회 시 경고) -->
