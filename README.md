# Validator Reward Checker

![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![MongoDB](https://img.shields.io/badge/MongoDB-6%2B-green)

7개 블록체인 validator 노드의 리워드를 **매일 자동**으로 온체인에서 수집하여 MongoDB에 저장하고, Slack 및 Google Sheets로 보고하는 시스템.

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
- **npm** v10 이상
- **MongoDB** v6 이상 (로컬 설치 또는 [MongoDB Atlas](https://www.mongodb.com/atlas))
- OS: macOS / Linux (Windows는 WSL2 권장)

---

## 설치 (Installation)

```bash
# 1. 저장소 클론
git clone <repo-url>
cd validator-reward-checker

# 2. 의존성 설치
npm install

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

### Notifications

| 변수명 | 필수 | 설명 |
|--------|:----:|------|
| `SLACK_WEBHOOK_URL` | ✅ | Slack Incoming Webhook URL |
| `GOOGLE_SHEETS_ID` | 선택 | Google Sheets 문서 ID (URL의 `/d/{ID}/` 부분) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 선택 | 서비스 계정 JSON을 base64 인코딩한 값 |

> Google Service Account Key 인코딩:
> ```bash
> base64 -i service-account.json | tr -d '\n'
> ```

### RPC / API 엔드포인트 및 지갑 주소

| 변수명 | 필수 | 설명 |
|--------|:----:|------|
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
npm run db:init
```

---

## 앱 실행 (Usage)

### 개발 모드

파일 변경을 감지하여 자동 재시작합니다.

```bash
npm run dev
```

### CLI — 수동 실행

특정 날짜의 리워드를 즉시 수집합니다.

```bash
# 특정 체인, 특정 날짜
npm run cli -- --chain avail --date 2025-03-17

# 전체 체인, 특정 날짜
npm run cli -- --date 2025-03-17
```

`--chain` 옵션: `avail` | `stacks` | `story` | `hyperliquid` | `bera` | `infrared` | `monad`

### 스케줄러 모드 (프로덕션)

매일 **00:00 KST**에 전체 체인 리워드를 자동 수집합니다.

```bash
npm run build
node dist/index.js
```

---

## 테스트

```bash
npm test
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
Scheduler (node-cron)
    └── Fetchers (체인별)
            └── RewardCalculator
                    └── MongoDB
                            ├── Slack Reporter
                            └── Google Sheets Reporter
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
