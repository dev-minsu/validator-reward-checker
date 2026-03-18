# Plan: Phase 1-2 — DB 설정

> **Feature**: `db-setup`
> **Phase**: Plan
> **작성일**: 2026-03-18
> **참고 문서**: [PRD.md](../../PRD.md) | [ARCHITECTURE.md](../../ARCHITECTURE.md) | [TASK.md](../../TASK.md)

---

## 1. 목표 (Objective)

MongoDB 연결 클라이언트와 컬렉션 초기화 스크립트를 구현한다.
4개 컬렉션의 인덱스를 생성하고, 7개 체인의 `validator_projects` 시드 데이터를 삽입하여
이후 Fetcher 및 StorageService가 즉시 사용할 수 있는 DB 상태를 준비한다.

---

## 2. 배경 및 이유 (Background)

- Phase 1-1에서 프로젝트 기반 설정이 완료되어 `mongodb` 패키지가 설치된 상태
- 이후 구현할 `storage.service.ts`, `reward-calculator.ts` 등은 모두 DB 연결과 인덱스에 의존
- `balance_snapshots`에 unique index 없이 upsert를 실행하면 중복 문서가 발생할 수 있어
  인덱스 사전 설정이 필수
- 7개 validator 프로젝트의 메타데이터(체인명, 토큰, fetchType, 시작일)는 정적 시드 데이터로
  관리하여 코드 내 하드코딩을 방지

---

## 3. 범위 (Scope)

### In Scope

| 항목 | 설명 |
|------|------|
| `src/db/client.ts` | MongoDB 싱글톤 연결 (`MongoClient`, `MONGO_DB_URI` 환경 변수 사용) |
| `src/db/seed.ts` | 4개 컬렉션 인덱스 생성 + `validator_projects` 시드 데이터 삽입 |
| `npm run db:init` | `seed.ts` 실행 스크립트 (`package.json` scripts에 추가) |
| 시드 데이터 | 7개 체인 초기 데이터 (Avail, Stacks, Story, Bera, Infrared, Hyperliquid, Monad) |

### Out of Scope

- 공통 유틸리티 (`src/utils/`) — Phase 1-3에서 처리
- Fetcher 구현 — Phase 1-4에서 처리
- StorageService upsert 로직 — Phase 1-4에서 처리
- 출금 내역 등록 CLI — Phase 5에서 처리

---

## 4. 요구사항 (Requirements)

### 기능 요구사항

| ID | 요구사항 |
|----|----------|
| R-01 | `src/db/client.ts`가 `MONGO_DB_URI` 환경 변수로 MongoDB에 연결해야 함 |
| R-02 | DB 클라이언트는 싱글톤 패턴으로 구현하여 중복 연결을 방지해야 함 |
| R-03 | `seed.ts` 실행 시 4개 컬렉션 인덱스가 생성(또는 이미 존재하면 no-op)되어야 함 |
| R-04 | `balance_snapshots`에 `{ projectId: 1, snapshotDate: 1 }` unique index가 생성되어야 함 |
| R-05 | `token_transfer_snapshots`에 `{ projectId: 1, snapshotDate: 1, tokenSymbol: 1 }` unique index가 생성되어야 함 |
| R-06 | `withdrawal_records`에 `{ projectId: 1, withdrawnAt: -1 }` index가 생성되어야 함 |
| R-07 | `validator_projects`에 7개 체인 시드 데이터가 삽입되어야 함 (이미 존재하면 skip) |
| R-08 | `npm run db:init` 명령으로 seed.ts가 실행되어야 함 |

### 비기능 요구사항

| ID | 요구사항 |
|----|----------|
| NR-01 | `seed.ts`는 멱등성(idempotent)을 보장해야 함 — 반복 실행해도 중복/오류 없음 |
| NR-02 | `client.ts`는 연결 실패 시 명확한 에러 메시지와 함께 프로세스를 종료해야 함 |
| NR-03 | 금액/잔고 관련 필드(`balance`, `amount` 등)는 `string` 타입으로 저장 — `number` 금지 |

---

## 5. 기술 결정 사항 (Technical Decisions)

### 5-1. DB 클라이언트 싱글톤 패턴

```typescript
// src/db/client.ts
let client: MongoClient | null = null;

export async function getDb(): Promise<Db> {
  if (!client) {
    client = new MongoClient(process.env.MONGO_DB_URI!);
    await client.connect();
  }
  return client.db();
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
```

- 싱글톤으로 관리하여 크론/CLI 실행 시 연결 풀 낭비 방지
- `closeDb()`를 process 종료 시 반드시 호출 (연결 누수 방지)

### 5-2. 시드 데이터 멱등성 처리

```typescript
// insertOne 대신 updateOne + upsert: true 사용
await col.updateOne(
  { chain: project.chain },
  { $setOnInsert: project },
  { upsert: true }
);
```

- `$setOnInsert`: 문서가 없을 때만 삽입, 이미 존재하면 변경 없음
- 반복 실행해도 기존 데이터 덮어쓰지 않음

### 5-3. 인덱스 생성 멱등성

```typescript
// createIndex는 이미 존재하면 no-op (MongoDB 기본 동작)
await db.collection('balance_snapshots').createIndex(
  { projectId: 1, snapshotDate: 1 },
  { unique: true }
);
```

### 5-4. 7개 체인 시드 데이터

| chain | name | tokenSymbol | fetchType | startDate |
|-------|------|-------------|-----------|-----------|
| avail | Avail Validator | AVAIL | A | 2025-01-20 |
| stacks | Stacks Signer | BTC | B | 2024-04-29 |
| story | Story Validator | IP | B | 2025-03-05 |
| bera | Bera Validator | BGT | C | 2025-02-06 |
| infrared | Infrared Bera Validator | iBERA | C | 2025-04-21 |
| hyperliquid | Hyperliquid | HYPE | B | 2025-04-22 |
| monad | Monad | MON | C | 2025-11-13 |

---

## 6. 파일 목록 (Deliverables)

| 파일 | 설명 |
|------|------|
| `src/db/client.ts` | MongoDB 싱글톤 연결 클라이언트 |
| `src/db/seed.ts` | 컬렉션 인덱스 생성 + 시드 데이터 삽입 |
| `package.json` (수정) | `db:init` 스크립트 추가 |

---

## 7. 완료 기준 (Definition of Done)

- [ ] `npm run db:init` 실행 시 인덱스 4개 생성 완료 로그 출력
- [ ] `npm run db:init` 재실행 시 에러 없이 정상 종료 (멱등성 확인)
- [ ] MongoDB에 `validator_projects` 컬렉션에 7개 문서 존재
- [ ] `balance_snapshots` unique index 생성 확인
- [ ] `token_transfer_snapshots` unique index 생성 확인
- [ ] `withdrawal_records` index 생성 확인
- [ ] `getDb()`를 여러 번 호출해도 단일 `MongoClient` 인스턴스 재사용

---

## 8. 리스크 및 고려사항

| 리스크 | 대응 |
|--------|------|
| MongoDB 연결 실패 시 전체 프로세스 중단 | `getDb()`에서 에러를 throw, 상위에서 로깅 후 종료 |
| 시드 데이터 중복 삽입 | `$setOnInsert` + `upsert: true`로 멱등성 보장 |
| `walletAddress` 없이 시드 삽입 | 환경 변수에서 읽거나 빈 문자열로 초기화 후 운영 전 교체 |
| `MONGO_DB_URI` 환경 변수 누락 | `src/config/env.ts`(Phase 1-3)에서 zod로 검증 예정, seed.ts는 직접 process.env 참조 |

---

## 9. 다음 Phase 연계

이 Phase 완료 후 → **Phase 1-3 (공통 인프라)**: `src/utils/logger.ts`, `src/utils/retry.ts`,
`src/utils/bignum.ts`, `src/fetchers/base.fetcher.ts`, `src/config/env.ts` 구현
