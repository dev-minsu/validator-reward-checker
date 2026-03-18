# Validator Reward Updater — Architecture

---

## 1. 시스템 컴포넌트

```
┌──────────────────────────────────────────────────────┐
│                   Scheduler (node-cron)               │
│                 매일 00:00 KST 자동 실행               │
│             또는 CLI: npx ts-node src/cli.ts          │
└───────────────────────┬──────────────────────────────┘
                        │ 병렬 실행
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
   ┌─────────────────────────────────────────────┐
   │              Chain Fetchers                  │
   │  (독립 실행 — 한 체인 실패가 전체 중단 안 함)  │
   ├─────────────────────────────────────────────┤
   │  [Type A] AvailFetcher    polkadot.js        │
   │  [Type B] StacksFetcher   Hiro REST          │
   │  [Type B] StoryFetcher    Cosmos SDK REST    │
   │  [Type B] HyperliquidFetcher  Custom REST    │
   │  [Type C] BeraFetcher     EVM Event Filter   │
   │  [Type C] InfraredFetcher EVM Event Filter   │
   │  [Type C] MonadFetcher    EVM Event Filter   │
   └──────────────────┬──────────────────────────┘
                      │ FetchResult[]
                      ▼
   ┌──────────────────────────────┐
   │       RewardCalculator       │
   │  Type A: balance diff        │
   │  Type B: staking balance diff│
   │  Type C: tx 합산             │
   │  + 출금액 보정               │
   └──────────────┬───────────────┘
                  │ RewardResult[]
                  ▼
   ┌──────────────────────────────┐
   │       StorageService         │
   │  balance_snapshots upsert    │
   │  withdrawal_records 참조     │
   └──────────────┬───────────────┘
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
 ┌─────────────┐    ┌──────────────────┐
 │SlackNotifier│    │SpreadsheetUpdater│
 │  daily 요약  │    │ Google Sheets API│
 └─────────────┘    └──────────────────┘
```

---

## 2. Fetcher 인터페이스 설계

모든 fetcher는 공통 인터페이스를 구현한다.

```typescript
// src/fetchers/base.fetcher.ts

export interface FetchResult {
  projectId: number;
  snapshotDate: string;          // YYYY-MM-DD
  balance: string;               // 최신 잔고 (문자열로 정밀도 유지)
  tokenSymbol: string;           // 주 토큰
  additionalTokens?: {           // Type C: 복수 토큰 수신 시
    symbol: string;
    amount: string;
  }[];
  rawData: Record<string, unknown>;  // 원본 응답 (embedded document)
  fetchType: 'A' | 'B' | 'C';
}

export interface IFetcher {
  readonly projectName: string;
  readonly fetchType: 'A' | 'B' | 'C';
  fetch(date: string): Promise<FetchResult>;
}
```

### Type A 구현 (Avail)
```typescript
// src/fetchers/avail.fetcher.ts
// polkadot.js ApiPromise → api.query.system.account(address)
// free + reserved 잔고 합산
// planck(1e18) → AVAIL 변환
```

### Type B 구현 (Stacks, Story, Hyperliquid)
```typescript
// src/fetchers/stacks.fetcher.ts  → Hiro REST GET /extended/v1/accounts/{addr}
// src/fetchers/story.fetcher.ts   → Cosmos /cosmos/staking/v1beta1/delegations/{addr}
// src/fetchers/hyperliquid.fetcher.ts → 자체 REST
```

### Type C 구현 (Bera, Infrared, Monad)
```typescript
// src/fetchers/evm-transfer.fetcher.ts  (공통 베이스)
// ethers.js provider.getLogs() + Transfer 이벤트 필터
// 특정 날짜 블록 범위 계산 후 수신 tx 합산
```

---

## 3. DB 스키마 (MongoDB)

MongoDB 4개 컬렉션으로 구성. 금액/잔고는 부동소수점 오차 방지를 위해 `string` 타입으로 저장한다.

### validator_projects
```typescript
{
  _id:           ObjectId,
  name:          string,          // "Avail Validator"
  chain:         string,          // "avail" | "stacks" | "story" | ...
  tokenSymbol:   string,          // "AVAIL" | "BTC" | "IP" | ...
  fetchType:     'A' | 'B' | 'C',
  walletAddress: string,
  startDate:     string,          // "YYYY-MM-DD"
  isActive:      boolean,
  createdAt:     Date
}
```

### balance_snapshots *(Type A/B용)*
```typescript
{
  _id:          ObjectId,
  projectId:    ObjectId,         // ref: validator_projects
  snapshotDate: string,           // "YYYY-MM-DD"
  balance:      string,           // BigNumber 직렬화 — 절대 number 변환 금지
  rewardAmount: string | null,    // null = 최초 실행 (전일 스냅샷 없음)
  rawData:      object,           // 원본 RPC 응답
  createdAt:    Date
}
// unique index: { projectId: 1, snapshotDate: 1 }
```

### token_transfer_snapshots *(Type C용)*
```typescript
{
  _id:            ObjectId,
  projectId:      ObjectId,       // ref: validator_projects
  snapshotDate:   string,         // "YYYY-MM-DD"
  tokenSymbol:    string,         // 리워드 토큰 심볼 (복수 가능)
  tokenAddress:   string,         // ERC-20 컨트랙트 주소
  receivedAmount: string,         // 당일 수신 총액 (string)
  txCount:        number,
  rawData:        object,
  createdAt:      Date
}
// unique index: { projectId: 1, snapshotDate: 1, tokenSymbol: 1 }
```

### withdrawal_records
```typescript
{
  _id:         ObjectId,
  projectId:   ObjectId,          // ref: validator_projects
  txHash:      string,
  tokenSymbol: string,
  amount:      string,            // 출금액 (string)
  withdrawnAt: string,            // "YYYY-MM-DD"
  note:        string,
  createdAt:   Date
}
// index: { projectId: 1, withdrawnAt: -1 }
```

> **Note**: Type A/B는 `balance_snapshots`, Type C는 `token_transfer_snapshots` 컬렉션 사용.
> `validator_projects.fetchType` 필드로 어느 컬렉션을 조회할지 결정한다.

---

## 4. 디렉토리 구조

```
validator-reward-updater/
├── src/
│   ├── index.ts                    # 크론 스케줄러 진입점
│   ├── cli.ts                      # 수동 실행 CLI
│   ├── config/
│   │   ├── env.ts                  # 환경 변수 로드 + 검증 (zod)
│   │   └── networks.ts             # 체인별 설정 객체
│   ├── fetchers/
│   │   ├── base.fetcher.ts         # IFetcher 인터페이스
│   │   ├── avail.fetcher.ts        # [Type A]
│   │   ├── stacks.fetcher.ts       # [Type B]
│   │   ├── story.fetcher.ts        # [Type B]
│   │   ├── hyperliquid.fetcher.ts  # [Type B]
│   │   ├── evm-transfer.fetcher.ts # [Type C 공통 베이스]
│   │   ├── bera.fetcher.ts         # [Type C]
│   │   ├── infrared.fetcher.ts     # [Type C]
│   │   └── monad.fetcher.ts        # [Type C]
│   ├── services/
│   │   ├── reward-calculator.ts    # Type별 리워드 계산 + 출금 보정
│   │   ├── storage.service.ts      # MongoDB upsert (replaceOne + upsert)
│   │   ├── slack.service.ts        # Slack Webhook 알림
│   │   └── spreadsheet.service.ts  # Google Sheets API
│   ├── db/
│   │   ├── client.ts               # MongoDB 연결 (mongodb native driver)
│   │   └── seed.ts                 # 컬렉션 인덱스 초기화 + 시드 데이터
│   └── utils/
│       ├── retry.ts                # exponential backoff 재시도
│       ├── logger.ts               # 구조화 로그 (pino)
│       └── bignum.ts               # 고정밀 소수 연산 (bignumber.js)
├── tests/
│   ├── fetchers/
│   │   └── avail.fetcher.test.ts
│   └── services/
│       └── reward-calculator.test.ts
├── .env.example
├── package.json
├── tsconfig.json
└── docs/
    ├── PRD.md
    ├── ARCHITECTURE.md
    ├── CLAUDE.md
    └── TASK.md
```

---

## 5. 환경 변수

```env
# ── Database ──────────────────────────────────
MONGO_DB_URI=mongodb://localhost:27017/validator_rewards

# ── Notifications ─────────────────────────────
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
GOOGLE_SHEETS_ID=
GOOGLE_SERVICE_ACCOUNT_KEY=   # base64-encoded JSON

# ── Avail (Type A) ────────────────────────────
AVAIL_RPC_URL=wss://mainnet.avail-rpc.com
AVAIL_WALLET_ADDRESS=

# ── Stacks (Type B) ───────────────────────────
STACKS_API_URL=https://api.mainnet.stacks.co
STACKS_WALLET_ADDRESS=

# ── Story (Type B) ────────────────────────────
STORY_REST_URL=https://api.story.foundation
STORY_WALLET_ADDRESS=

# ── Hyperliquid (Type B) ──────────────────────
HYPERLIQUID_API_URL=https://api.hyperliquid.xyz
HYPERLIQUID_WALLET_ADDRESS=

# ── Berachain (Type C) ────────────────────────
BERA_RPC_URL=https://rpc.berachain.com
BERA_WALLET_ADDRESS=
BERA_REWARD_VAULT_ADDRESS=

# ── Infrared (Type C) ─────────────────────────
INFRARED_RPC_URL=https://rpc.berachain.com
INFRARED_WALLET_ADDRESS=
INFRARED_TOKEN_ADDRESS=

# ── Monad (Type C) ────────────────────────────
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_WALLET_ADDRESS=
```
