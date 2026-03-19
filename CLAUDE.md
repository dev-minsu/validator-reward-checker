# Validator Reward Updater — Claude Code 가이드

이 파일은 Claude Code가 이 프로젝트를 작업할 때 참고하는 컨텍스트 문서입니다.

---

## 프로젝트 개요

7개 블록체인 validator 노드의 리워드를 매일 자동으로 온체인에서 수집하여 MongoDB에 저장하고, Slack 및 Google Sheets로 보고하는 시스템.

- **PRD**: [PRD.md](./PRD.md)
- **설계**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **현재 태스크**: [TASK.md](./TASK.md)

---

## 개발 명령어

```bash
# 의존성 설치
npm install

# 개발 모드 실행 (ts-node-dev)
npm run dev

# 빌드
npm run build

# 단일 실행 (특정 날짜, 특정 체인)
npm run cli -- --chain avail --date 2025-03-17

# 전체 체인 수동 실행
npm run cli -- --date 2025-03-17

# 테스트
npm test

# DB 컬렉션 초기화 (인덱스 생성 + 시드 데이터)
npm run db:init
```

---

## 기술 스택

| 역할 | 패키지 |
|---|---|
| 런타임 | Node.js 20 LTS |
| 언어 | TypeScript (strict) |
| Substrate RPC | `@polkadot/api` |
| EVM | `ethers` v6 |
| DB 클라이언트 | `mongodb` (native driver) |
| 환경 변수 검증 | `zod` |
| 스케줄러 | `node-cron` |
| 로깅 | `pino` |
| 고정밀 연산 | `bignumber.js` |
| 테스트 | `vitest` |

---

## 코드 컨벤션

### TypeScript
- `strict: true` 필수. `any` 사용 금지 — 불가피할 경우 `unknown` + 타입 가드 사용
- 모든 fetcher는 `IFetcher` 인터페이스 구현 (`src/fetchers/base.fetcher.ts`)
- 잔고/금액은 반드시 `string` 또는 `BigNumber`로 처리 — `number` 부동소수점 금지

### 에러 처리
```typescript
// ❌ 잘못된 예
try {
  const result = await fetcher.fetch(date);
} catch (e) {
  console.error(e);  // 로그만 남기고 무시
}

// ✅ 올바른 예
try {
  const result = await fetcher.fetch(date);
  return { ok: true, data: result };
} catch (error) {
  logger.error({ chain: fetcher.projectName, error }, 'fetch failed');
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}
```

### 재시도 패턴
```typescript
// src/utils/retry.ts 의 withRetry() 사용
const result = await withRetry(() => fetcher.fetch(date), {
  maxAttempts: 3,
  baseDelayMs: 1000,  // 1s → 2s → 4s
});
```

### 로깅
```typescript
import { logger } from '@/utils/logger';

logger.info({ chain: 'avail', date, balance }, 'snapshot fetched');
logger.error({ chain: 'avail', error }, 'fetch failed after retries');
```

---

## PDCA 워크플로우 규칙

### /pdca report 완료 후 TASK.md 자동 업데이트

`/pdca report {feature}` 완료 보고서 생성 후 반드시 다음을 수행한다:

1. **TASK.md 읽기** — 현재 내용 확인
2. **feature에 해당하는 태스크 항목 식별** — feature 이름으로 관련 섹션 찾기
3. **미완료 항목을 완료로 표시**:
   - `- [ ]` → `- [x]`
   - 섹션 제목의 상태 미표시 → `✅ (YYYY-MM-DD 완료, Match Rate XX%)` 추가
4. **TASK.md 저장**

**적용 규칙**:
- feature = `avail-fetcher` → TASK.md의 `1-4`, `1-5`, `1-6` 섹션 완료 처리
- feature = `common-infrastructure` → TASK.md의 `1-3` 섹션 완료 처리
- 일반 규칙: feature 이름과 관련된 모든 미완료 항목을 완료로 처리
- Match Rate는 `docs/03-analysis/{feature}.analysis.md` 에서 읽어온다
- 날짜는 오늘 날짜 사용

---

## 새 체인 추가 체크리스트

새 validator 체인을 추가할 때 다음 순서로 작업한다:

1. `src/fetchers/` 에 `{chain}.fetcher.ts` 생성 (`IFetcher` 구현)
2. `src/config/networks.ts` 에 체인 설정 추가
3. `.env.example` 에 필요한 환경 변수 추가
4. `src/db/seed.ts` 에 신규 컬렉션 인덱스 추가 (필요 시)
5. `src/index.ts` 의 fetcher 목록에 등록
6. `tests/fetchers/{chain}.fetcher.test.ts` 작성 (mock 포함)
7. `PRD.md` 지원 네트워크 표 업데이트
8. `TASK.md` 에 해당 체인 태스크 완료 처리

---

## 주의 사항

### 보안
- `.env` 파일은 절대 커밋하지 않는다 (`.gitignore` 확인)
- wallet address, private key, API key 는 모두 환경 변수로만 관리
- `GOOGLE_SERVICE_ACCOUNT_KEY` 는 base64 인코딩 후 환경 변수로 전달

### 정밀도
- AVAIL: 소수점 18자리 (1 AVAIL = 10^18 planck)
- BTC: 소수점 8자리 (1 BTC = 10^8 satoshi)
- EVM 토큰: 각 ERC-20 `decimals()` 호출로 확인
- MongoDB 저장 시 `string` 타입 유지 — JavaScript `number` 변환 금지 (부동소수점 오차)

### RPC 레이트리밋
- polkadot.js WebSocket 연결은 작업 완료 후 반드시 `api.disconnect()` 호출
- EVM RPC 호출 간 과도한 병렬 요청 지양 (블록 조회 시 배치 처리)
- 공개 RPC 사용 시 레이트리밋에 걸릴 수 있으므로 재시도 로직 필수

### Type C (ERC-20 Transfer) 특이사항
- 같은 날 동일 tx가 중복 집계되지 않도록 tx_hash 기준 dedup 처리 필요
- 리워드 토큰이 여러 종류일 수 있으므로 `token_transfer_snapshots` 컬렉션에 tokenSymbol 별로 별도 document 저장
