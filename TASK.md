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

### 1-2. DB 설정

- [ ] `src/db/client.ts` — MongoDB 연결 (`MongoClient`, `MONGO_DB_URI` 환경 변수 사용)
- [ ] `src/db/seed.ts` 작성
  - `validator_projects` 컬렉션 인덱스 없음 (기본 `_id`)
  - `balance_snapshots` unique index: `{ projectId: 1, snapshotDate: 1 }`
  - `token_transfer_snapshots` unique index: `{ projectId: 1, snapshotDate: 1, tokenSymbol: 1 }`
  - `withdrawal_records` index: `{ projectId: 1, withdrawnAt: -1 }`
- [ ] `npm run db:init` 스크립트 작성 (seed.ts 실행)
- [ ] `validator_projects` 시드 데이터 삽입 (7개 체인 초기 데이터)

---

### 1-3. 공통 인프라

- [ ] `src/utils/logger.ts` — pino 기반 구조화 로그
- [ ] `src/utils/retry.ts` — `withRetry(fn, { maxAttempts, baseDelayMs })` 구현
- [ ] `src/utils/bignum.ts` — `toHuman(planck, decimals)` 단위 변환 유틸
- [ ] `src/fetchers/base.fetcher.ts` — `IFetcher` 인터페이스 + `FetchResult` 타입 정의
- [ ] `src/config/env.ts` — zod로 환경 변수 파싱 + 유효성 검증

---

### 1-4. Avail Fetcher 구현 (Type A — Balance Diff)

> Avail은 Substrate 기반 체인. `@polkadot/api` 의 `ApiPromise` 로 접속하여
> `api.query.system.account(address)` 로 잔고를 조회한다.

- [ ] `src/fetchers/avail.fetcher.ts` 작성
  - [ ] `ApiPromise.create({ provider: WsProvider(AVAIL_RPC_URL) })` 로 연결
  - [ ] `api.query.system.account(AVAIL_WALLET_ADDRESS)` 호출
  - [ ] `data.free` + `data.reserved` 합산 → 총 잔고 (planck 단위)
  - [ ] planck → AVAIL 변환: `bignumber.js` 사용, `÷ 10^18`
  - [ ] 작업 완료 후 `api.disconnect()` 호출 (연결 누수 방지)
  - [ ] `FetchResult` 형태로 반환 (`fetchType: 'A'`)
  - [ ] `withRetry()` 적용 (최대 3회)

- [ ] `src/services/reward-calculator.ts` — Type A 리워드 계산
  - [ ] `calculateTypeA(today, yesterday, withdrawals): rewardAmount`
  - [ ] 공식: `(오늘 잔고 + 당일 출금액 합산) - 어제 잔고`
  - [ ] 어제 스냅샷이 없는 경우(최초 실행): `reward = null` 처리

- [ ] `src/services/storage.service.ts` — DB 저장
  - [ ] `balance_snapshots` upsert (`replaceOne({ projectId, snapshotDate }, doc, { upsert: true })`)
  - [ ] `withdrawal_records` 조회 (당일 출금 보정용, `find({ projectId, withdrawnAt: date })`)

---

### 1-5. CLI 수동 실행

- [ ] `src/cli.ts` 작성
  - `--chain avail` 옵션으로 특정 체인만 실행
  - `--date 2025-03-17` 옵션으로 특정 날짜 지정 (기본값: 오늘)
  - `--dry-run` 옵션: DB 저장 없이 결과만 출력

  ```bash
  # 사용 예시
  npm run cli -- --chain avail --date 2025-03-17
  npm run cli -- --chain avail --dry-run
  ```

---

### 1-6. 단위 테스트

- [ ] `tests/fetchers/avail.fetcher.test.ts`
  - [ ] polkadot.js `ApiPromise` mock 처리
  - [ ] 정상 잔고 조회 → planck → AVAIL 변환 검증
  - [ ] RPC 오류 시 재시도 로직 동작 확인
  - [ ] `api.disconnect()` 호출 여부 확인

- [ ] `tests/services/reward-calculator.test.ts`
  - [ ] Type A 기본 계산 (`reward = today - yesterday`)
  - [ ] 출금 보정 (`reward = (today + withdrawal) - yesterday`)
  - [ ] 최초 실행 (어제 스냅샷 없음) → `reward = null`
  - [ ] 잔고가 줄었을 때 출금 기록 없으면 경고 로그

---

## Phase 2 이후 (백로그)

> Phase 1 완료 후 순서대로 진행

### Phase 2: Type B Fetchers
- [ ] Stacks Fetcher (Hiro REST API)
- [ ] Story Fetcher (Cosmos SDK staking REST)
- [ ] Hyperliquid Fetcher (자체 REST API)

### Phase 3: Type C Fetchers
- [ ] EVM Transfer 공통 베이스 (`src/fetchers/evm-transfer.fetcher.ts`)
  - ethers.js `provider.getLogs()` + ERC-20 Transfer 이벤트 필터
  - 날짜 → 블록 범위 변환 로직
  - tx_hash 기준 dedup 처리
- [ ] Bera Fetcher (BGT Reward Vault 이벤트)
- [ ] Infrared Fetcher (iBERA ERC-20 Transfer)
- [ ] Monad Fetcher (MON ERC-20 Transfer, 테스트넷)

### Phase 4: 알림 및 리포팅
- [ ] Slack 알림 (`src/services/slack.service.ts`)
- [ ] Google Sheets 동기화 (`src/services/spreadsheet.service.ts`)
- [ ] 크론 스케줄러 (`src/index.ts`) — 매일 00:00 KST

### Phase 5: 안정화
- [ ] 통합 테스트 (실제 RPC 연결, --dry-run 모드)
- [ ] 출금 내역 등록 CLI (`npm run cli -- --add-withdrawal`)
- [ ] 과거 날짜 재처리 배치 스크립트
- [ ] 헬스체크 + 모니터링 알림 (연속 실패 N회 시 경고)
