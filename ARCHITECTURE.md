# Validator Reward Updater — Architecture

---

## 1. 시스템 컴포넌트

```
┌─────────────────────────────────────────────────────────────┐
│                통합 스케줄러 (src/index.ts)                   │
│  ┌──────────────────────────┐  ┌────────────────────────┐   │
│  │  잔고 수집 Cron           │  │  리포트 생성 Cron        │   │
│  │  BALANCE_COLLECTION_CRON │  │  REPORT_CRON           │   │
│  │  (기본: 매시 정각)        │  │  (기본: 매월 26일 00:00) │   │
│  └──────────────┬───────────┘  └──────────┬─────────────┘   │
└─────────────────┼────────────────────────┼─────────────────┘
                  │                        │
                  ▼                        ▼
   ┌──────────────────────┐   ┌────────────────────────────┐
   │   AvailFetcher       │   │      ReportService          │
   │   polkadot.js RPC    │   │  기간 경계 잔고 조회         │
   │   balance 조회       │   │  IndexerService 호출        │
   └──────────┬───────────┘   │  rewardAmount 계산          │
              │               │  reward_reports 저장        │
              ▼               │  CSV 출력                   │
   ┌──────────────────────┐   └──────────┬─────────────────┘
   │   StorageService     │              │
   │   saveBalanceHistory │   ┌──────────▼─────────────────┐
   │   balance_history    │   │      IndexerService         │
   │   (TTL 90일)         │   │  Subscan API 조회           │
   └──────────────────────┘   │  withdrawal_records 캐시   │
                              └──────────┬─────────────────┘
                                         │
                              ┌──────────▼─────────────────┐
                              │      SlackService           │
                              │  리포트 완료 알림           │
                              │  에러 알림                  │
                              └────────────────────────────┘
```

---

## 2. Fetcher 인터페이스

모든 fetcher는 공통 인터페이스를 구현한다.

```typescript
// src/fetchers/base.fetcher.ts

export interface SnapshotData {
  projectId: string;
  snapshotDate: string;      // "YYYY-MM-DD"
  balance?: string;          // Type A/B: 잔고 (planck string)
  rewardAmount?: string;     // 계산된 리워드 (human 단위 string)
  fetchType: 'A' | 'B' | 'C';
  rawData?: unknown;
}

export type FetchResult =
  | { ok: true; data: SnapshotData }
  | { ok: false; error: string };

export interface IFetcher {
  readonly projectName: string;
  readonly fetchType: 'A' | 'B' | 'C';
  fetch(date: string): Promise<FetchResult>;
}
```

---

## 3. DB 스키마 (MongoDB)

금액/잔고는 부동소수점 오차 방지를 위해 `string` 타입으로 저장한다.
저장 시각은 모두 **UTC**로 저장하고, 표시/경계 계산 시 KST로 변환한다.

### validator_projects
```typescript
{
  _id:           ObjectId,
  name:          string,          // "Avail Validator"
  chain:         string,          // "avail" | "stacks" | ...
  tokenSymbol:   string,          // "AVAIL" | "BTC" | ...
  fetchType:     'A' | 'B' | 'C',
  walletAddress: string,
  startDate:     string,          // "YYYY-MM-DD"
  isActive:      boolean,
  createdAt:     Date
}
```

### balance_history *(주기적 잔고 수집용, TTL 90일)*
```typescript
{
  _id:        ObjectId,
  projectId:  string,     // "avail"
  snapshotAt: Date,       // UTC timestamp (수집 시각)
  balance:    string,     // planck string — 절대 number 변환 금지
  fetchType:  'A' | 'B' | 'C',
  createdAt:  Date,       // TTL 기준 필드
}
// unique index: { projectId: 1, snapshotAt: 1 }
// TTL index: createdAt, expireAfterSeconds: 7776000 (90일)
```

### balance_snapshots *(기존 일단위 스냅샷, 하위 호환용)*
```typescript
{
  _id:          ObjectId,
  projectId:    string,
  snapshotDate: string,           // "YYYY-MM-DD"
  balance:      string,
  rewardAmount: string | null,
  fetchType:    'A' | 'B' | 'C',
  updatedAt:    Date
}
// unique index: { projectId: 1, snapshotDate: 1 }
```

### token_transfer_snapshots *(Type C용)*
```typescript
{
  _id:            ObjectId,
  projectId:      string,
  snapshotDate:   string,
  tokenSymbol:    string,
  tokenAddress:   string,
  receivedAmount: string,
  txCount:        number,
  rawData:        object,
  createdAt:      Date
}
// unique index: { projectId: 1, snapshotDate: 1, tokenSymbol: 1 }
```

### withdrawal_records *(인덱서 조회 결과 캐시)*
```typescript
{
  _id:         ObjectId,
  projectId:   string,          // "avail"
  txHash:      string,
  amount:      string,          // planck string
  withdrawnAt: Date,            // UTC block timestamp
  blockNumber: number,
  source:      'subscan' | 'manual',
  rawResponse: object,          // 인덱서 원본 응답 (무결성 보장)
  fetchedAt:   Date,
  periodKey:   string,          // "2026-02-26_2026-03-25" (캐시 조회용)
}
// unique index: { projectId: 1, txHash: 1 }
// index: { projectId: 1, periodKey: 1 }
```

### indexer_query_cache *(인덱서 조회 완료 마커)*
```typescript
{
  _id:       ObjectId,
  projectId: string,   // "avail"
  periodKey: string,   // "2026-02-26_2026-03-25"
  queriedAt: Date,     // 조회 완료 시각 (UTC)
  count:     number,   // 0 = 인출 없음 (빈 결과도 캐싱)
  source:    'subscan',
}
// unique index: { projectId: 1, periodKey: 1 }
```

> **설계 의도**: `count = 0`인 기간을 별도로 기록함으로써, 인출이 없는 기간에 대해 재호출 시
> Subscan API를 재조회하지 않고 즉시 빈 배열을 반환한다. `withdrawal_records`에 sentinel 값을
> 넣지 않고 분리 컬렉션으로 관리해 스키마를 오염시키지 않는다.

### reward_reports *(월단위 리포트 결과)*
```typescript
{
  _id:              ObjectId,
  projectId:        string,
  periodStart:      Date,       // UTC
  periodEnd:        Date,       // UTC
  balanceStart:     string,     // planck (기간 시작 잔고)
  balanceEnd:       string,     // planck (기간 종료 잔고)
  totalWithdrawals: string,     // planck (기간 내 인출 합산)
  rewardAmount:     string,     // planck (= balanceEnd + totalWithdrawals − balanceStart)
  withdrawalCount:  number,
  generatedAt:      Date,
  version:          number,     // 재생성 시 increment
}
// unique index: { projectId: 1, periodStart: 1 }
```

---

## 4. 서비스 설계

### IndexerService (`src/services/indexer.service.ts`)
```typescript
class IndexerService {
  // periodKey: "YYYY-MM-DD_YYYY-MM-DD"
  async fetchWithdrawals(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<WithdrawalRecord[]>
  // 1. indexer_query_cache에서 (projectId, periodKey) 확인
  //    - count = 0 → 빈 배열 즉시 반환 (API 재호출 없음)
  //    - count > 0 → withdrawal_records에서 실제 레코드 반환
  // 2. 캐시 없으면 Subscan API 조회 (withRetry 3회, MAX_PAGES=100)
  // 3. withdrawal_records upsert (txHash 기준, rawResponse 포함)
  // 4. indexer_query_cache upsert (count = 결과 건수, 0건도 저장)
}
```

### ReportService (`src/services/report.service.ts`)
```typescript
class ReportService {
  async generate(
    projectId: string,
    periodStart: Date,  // UTC
    periodEnd: Date,    // UTC
  ): Promise<RewardReport>
  // 1. balance_history에서 경계 잔고 조회 (snapshotAt ≤ 경계시각 최신값)
  // 2. IndexerService.fetchWithdrawals()
  // 3. rewardAmount 계산
  // 4. reward_reports 저장 (version increment)
  // 5. CSV 생성

  toCsv(report: RewardReport): string
}
```

### SlackService (`src/services/slack.service.ts`)
```typescript
class SlackService {
  async sendReport(report: RewardReport): Promise<void>
  async sendError(chain: string, error: string): Promise<void>
}
```

### StorageService 추가 메서드 (`src/services/storage.service.ts`)
```typescript
// 기간 경계 잔고 조회: snapshotAt ≤ beforeOrAt 중 가장 최신값
async getSnapshotAt(projectId: string, beforeOrAt: Date): Promise<{ balance: string } | null>

// 주기적 잔고 저장
async saveBalanceHistory(data: { projectId: string; snapshotAt: Date; balance: string; fetchType: string }): Promise<void>
```

---

## 5. CLI 명령어

```bash
# 잔고 단건 수집 (수동)
npm run collect -- --chain avail

# 리포트 생성
npm run cli -- --report --chain avail --beg 2026-02-26 --end 2026-03-25   # 범위 직접 지정
npm run cli -- --report --chain avail --beg 2026-02-26                     # 시작만 지정 (end=어제 23:59:59)
npm run cli -- --report --chain avail                                       # 기본 기간 (전월 26일 ~ 어제)
npm run cli -- --report --chain avail --dry-run                            # DB 저장 없이 출력만

# 잔고 수동 입력 (수집 데이터 누락 시)
npm run cli -- --add-balance \
  --chain avail \
  --time "2026-02-26T00:00:00+09:00" \
  --balance 648173780900000000000000
```

---

## 6. 보고 기간 계산 규칙

| CLI 인수 | periodStart | periodEnd |
|---------|-------------|-----------|
| `--beg D --end D` | D 00:00:00 KST → UTC | D 23:59:59 KST → UTC |
| `--beg D` | D 00:00:00 KST → UTC | 어제 23:59:59 KST → UTC |
| (없음) | 전월 `REPORT_DEFAULT_START_DAY`일 00:00 KST → UTC | 어제 23:59:59 KST → UTC |

경계 잔고 매칭: `balance_history`에서 `snapshotAt ≤ 경계시각` 중 가장 최신 레코드 사용.

---

## 7. 디렉토리 구조

```
validator-reward-checker/
├── src/
│   ├── index.ts                    # 통합 스케줄러 (수집 + 리포트 cron)
│   ├── cli.ts                      # 수동 실행 CLI
│   ├── config/
│   │   ├── env.ts                  # 환경 변수 로드 + 검증 (zod)
│   │   └── networks.ts             # 체인별 설정 (TOML 로드)
│   ├── fetchers/
│   │   ├── base.fetcher.ts         # IFetcher 인터페이스
│   │   ├── avail.fetcher.ts        # [Type A] polkadot.js
│   │   └── ...                     # [Type B/C] 추후 추가
│   ├── services/
│   │   ├── reward-calculator.ts    # Type별 리워드 계산
│   │   ├── storage.service.ts      # MongoDB 저장/조회
│   │   ├── indexer.service.ts      # Subscan API + DB 캐시
│   │   ├── report.service.ts       # 월단위 리포트 생성 + CSV
│   │   └── slack.service.ts        # Slack 알림
│   ├── db/
│   │   ├── client.ts               # MongoDB 연결 (싱글톤)
│   │   └── seed.ts                 # 인덱스 초기화 + 시드 데이터
│   └── utils/
│       ├── retry.ts                # exponential backoff 재시도
│       ├── logger.ts               # 구조화 로그 (pino)
│       ├── bignum.ts               # 고정밀 소수 연산 (bignumber.js)
│       └── date.ts                 # KST/UTC 변환 유틸
├── config/
│   ├── networks.toml               # 체인별 RPC/API 설정 (gitignore)
│   └── networks.toml.example       # 템플릿
├── tests/
│   ├── fetchers/
│   ├── services/
│   ├── utils/
│   └── config/
├── docs/
│   ├── 01-plan/
│   ├── 02-design/
│   ├── 03-analysis/
│   └── 04-report/
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── PRD.md
├── ARCHITECTURE.md
├── CLAUDE.md
├── TASK.md
└── README.md
```

---

## 8. 환경 변수

```env
# ── Database ──────────────────────────────────────────────
MONGO_DB_URI=mongodb://localhost:27017/validator_rewards

# ── 스케줄러 ───────────────────────────────────────────────
BALANCE_COLLECTION_CRON="0 * * * *"    # 매시 정각 수집
REPORT_CRON="0 0 26 * *"               # 매월 26일 00:00 KST 리포트
REPORT_DEFAULT_START_DAY=26            # 인수 없을 때 기간 시작 기준일 (전월 N일)

# ── 알림 ───────────────────────────────────────────────────
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# ── Avail (Type A) ────────────────────────────────────────
# (config/networks.toml 로 관리 — .gitignore)
AVAIL_SUBSCAN_API_KEY=your_subscan_api_key

# ── Logging ────────────────────────────────────────────────
LOG_LEVEL=info
```

> 체인별 RPC URL / 지갑 주소는 `config/networks.toml`로 관리 (`config/networks.toml.example` 참고)
