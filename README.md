# Validator Reward Checker

![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![MongoDB](https://img.shields.io/badge/MongoDB-6%2B-green)

7개 블록체인 validator 노드의 리워드를 **주기적으로 자동 수집**하여 MongoDB에 저장하고, **월단위 리포트**를 생성하여 Slack으로 알림을 보내는 시스템.

---

## 지원 네트워크

| Network | Reward Type | Token | 수집 방식 |
|---------|-------------|-------|-----------|
| Avail | Type A | AVAIL | 잔고 차이 (Substrate RPC) |
| Stacks | Type B | STX | 스테이킹 API (Hiro REST) |
| Story | Type B | IP | 스테이킹 API (Cosmos SDK REST) |
| Hyperliquid | Type B | HYPE | Validator REST API |
| Berachain | Type C | BGT | ERC-20 Transfer 이벤트 |
| Infrared | Type C | iBGT | ERC-20 Transfer 이벤트 |
| Monad | Type C | MON | ERC-20 Transfer 이벤트 (테스트넷) |

---

## 실행 환경 (Requirements)

- **Node.js** v20 LTS 이상
- **pnpm** v10 이상
- **MongoDB** v6 이상 (로컬 설치 또는 [MongoDB Atlas](https://www.mongodb.com/atlas))
- OS: macOS / Linux (Windows는 WSL2 권장)

---

## 설치 (Installation)

```bash
# 1. 저장소 클론
git clone <repo-url>
cd validator-reward-checker

# 2. 의존성 설치
pnpm install

# 3. 환경 변수 설정
cp .env.example .env
```

`.env` 파일을 열어 아래 [환경 변수](#환경-변수-environment-variables) 섹션을 참고하여 값을 채웁니다.

---

## 환경 변수 (Environment Variables)

### Database

| 변수명 | 필수 | 설명 |
|--------|:----:|------|
| `MONGO_DB_URI` | ✅ | MongoDB 연결 URI (예: `mongodb://localhost:27017/validator_rewards`) |

### 스케줄러

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `BALANCE_COLLECTION_CRON` | `"0 * * * *"` | 잔고 수집 주기 (매시 정각) |
| `REPORT_CRON` | `"0 0 26 * *"` | 리포트 생성 주기 (매월 26일 00:00 KST) |
| `REPORT_DEFAULT_START_DAY` | `26` | 리포트 기간 시작 기준일 (전월 N일) |

### Notifications

| 변수명 | 필수 | 설명 |
|--------|:----:|------|
| `SLACK_WEBHOOK_URL` | ✅ | Slack Incoming Webhook URL |

### Subscan API 키 발급 (Avail 인출 자동 조회)

Avail 리포트는 Subscan API로 보고 기간 내 인출 트랜잭션을 자동 조회합니다.

1. [Subscan 웹사이트](https://www.subscan.io/) 접속 후 회원가입
2. 우측 상단 프로필 → **API Keys** 메뉴
3. **Create API Key** 클릭 → 이름 입력 (예: `validator-reward-checker`)
4. 생성된 API 키를 복사하여 `.env`에 설정:
   ```env
   AVAIL_SUBSCAN_API_KEY=your_api_key_here
   ```

> 무료 플랜으로 월 10,000건 조회 가능 (일반적인 운영에는 충분).

### RPC / API 엔드포인트 및 지갑 주소

| 변수명 | 필수 | 설명 |
|--------|:----:|------|
| `AVAIL_SUBSCAN_API_KEY` | ✅ | Subscan API 키 (Avail 인출 조회용) |
| `AVAIL_RPC_URL` | ✅ | Avail WebSocket RPC URL |
| `AVAIL_WALLET_ADDRESS` | ✅ | Avail validator 지갑 주소 |
| `STACKS_API_URL` | ✅ | Stacks Hiro REST API URL |
| `STACKS_WALLET_ADDRESS` | ✅ | Stacks validator 지갑 주소 |
| `STORY_REST_URL` | ✅ | Story Cosmos SDK REST URL |
| `STORY_WALLET_ADDRESS` | ✅ | Story validator 지갑 주소 |
| `HYPERLIQUID_API_URL` | ✅ | Hyperliquid validator REST API URL |
| `HYPERLIQUID_WALLET_ADDRESS` | ✅ | Hyperliquid validator 지갑 주소 |
| `BERA_RPC_URL` | ✅ | Berachain EVM RPC URL |
| `BERA_WALLET_ADDRESS` | ✅ | Berachain validator 지갑 주소 |
| `BERA_REWARD_VAULT_ADDRESS` | ✅ | BGT Reward Vault 컨트랙트 주소 |
| `INFRARED_RPC_URL` | ✅ | Infrared EVM RPC URL |
| `INFRARED_WALLET_ADDRESS` | ✅ | Infrared validator 지갑 주소 |
| `INFRARED_TOKEN_ADDRESS` | ✅ | iBGT ERC-20 토큰 컨트랙트 주소 |
| `MONAD_RPC_URL` | ✅ | Monad EVM RPC URL (테스트넷) |
| `MONAD_WALLET_ADDRESS` | ✅ | Monad validator 지갑 주소 |

> 전체 예시는 [`.env.example`](./.env.example) 참고

---

## DB 초기화 (Database Setup)

MongoDB에 인덱스를 생성하고 시드 데이터를 삽입합니다.

```bash
pnpm db:init
```

---

## 앱 실행 (Usage)

### 개발 모드

파일 변경을 감지하여 자동 재시작합니다.

```bash
pnpm dev
```

### 잔고 수동 수집

```bash
# 특정 체인 잔고 즉시 수집 → balance_history 저장
pnpm collect -- --chain avail
```

### 리포트 생성

```bash
# 날짜 범위 직접 지정
pnpm cli -- --report --chain avail --beg 2026-02-26 --end 2026-03-25

# 시작일만 지정 (종료: 어제 23:59:59 KST)
pnpm cli -- --report --chain avail --beg 2026-02-26

# 인수 없음 (전월 26일 ~ 어제 23:59:59 KST)
pnpm cli -- --report --chain avail

# dry-run: DB 저장·Slack 알림 없이 결과만 출력
pnpm cli -- --report --chain avail --dry-run
```

### 잔고 수동 입력 (수집 데이터 누락 시)

```bash
pnpm cli -- --add-balance \
  --chain avail \
  --time "2026-02-26T00:00:00+09:00" \
  --balance 648173780900000000000000
```

### 스케줄러 모드 (프로덕션)

잔고 수집 cron + 리포트 생성 cron을 하나의 프로세스에서 자동 실행합니다.

```bash
pnpm build
node dist/index.js
```

---

## 테스트

```bash
pnpm test
```

---

## 프로젝트 구조

```
src/
├── fetchers/       # 체인별 리워드 수집 (IFetcher 구현체)
├── services/       # MongoDB, Slack, Google Sheets 서비스
├── config/         # 네트워크 설정, 환경 변수 스키마 (zod)
├── db/             # 초기화 스크립트, 인덱스 정의
├── utils/          # logger, retry, BigNumber helpers
└── index.ts        # 스케줄러 진입점
```

---

## 아키텍처

```
통합 스케줄러 (node-cron)
├── 잔고 수집 cron (BALANCE_COLLECTION_CRON)
│       └── AvailFetcher → StorageService (balance_history, TTL 90일)
└── 리포트 cron (REPORT_CRON)
        └── ReportService
                ├── balance_history (경계 잔고 조회)
                ├── IndexerService → indexer_query_cache 확인 (빈 결과 포함)
                │       └── 캐시 미스 시 Subscan API → withdrawal_records + query_cache 저장
                ├── reward_reports (저장)
                ├── CSV 출력
                └── SlackService (알림)
```

> 상세 설계는 [ARCHITECTURE.md](./ARCHITECTURE.md) 참고

---

## 새 체인 추가

1. `src/fetchers/{chain}.fetcher.ts` 생성 (`IFetcher` 인터페이스 구현)
2. `src/config/networks.ts`에 체인 설정 추가
3. `.env.example`에 필요한 환경 변수 추가
4. `src/index.ts`의 fetcher 목록에 등록
5. `tests/fetchers/{chain}.fetcher.test.ts` 작성

> 상세 체크리스트는 [CLAUDE.md](./CLAUDE.md) 참고
