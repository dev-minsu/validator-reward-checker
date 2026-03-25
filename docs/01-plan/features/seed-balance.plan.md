# Plan: seed-balance

> **Feature**: `seed-balance`
> **Phase**: Plan
> **작성일**: 2026-03-24
> **작성자**: Claude Code

---

## 1. 배경 및 목적

### 문제

`rewardAmount` 계산은 `calculateTypeA(오늘잔고, 어제잔고, 출금목록)` 공식에 의존.
`balance_snapshots` 컬렉션에 어제 잔고가 없으면 최초 실행으로 간주하여 `rewardAmount = null` 반환.

현재 DB에 Avail 잔고 데이터가 없어 CLI 실행 시 rewardAmount 계산 불가.

### 목표

KST 2026-02-26 기준 Avail 잔고 `648173780900000000000000` (planck)를 DB에 삽입하여
이후 날짜(2026-02-27~)의 CLI 실행 시 rewardAmount 계산이 가능하도록 함.

---

## 2. 요구사항

### Functional Requirements

| ID | 요구사항 |
|----|---------|
| FR-01 | `balance_snapshots` 컬렉션에 avail 2026-02-26 데이터 삽입 |
| FR-02 | 삽입 방식은 upsert (중복 실행 시 덮어쓰기) |
| FR-03 | balance는 planck string으로 저장 (`"648173780900000000000000"`) |
| FR-04 | 기존 `npm run db:init` 명령 실행 시 함께 시드 |

### Non-Functional Requirements

- 기존 seed.ts 패턴과 일관성 유지 (upsert, replaceOne)
- 타입 안전 (TypeScript strict)

---

## 3. 삽입 Document 스펙

```json
{
  "projectId": "avail",
  "snapshotDate": "2026-02-26",
  "balance": "648173780900000000000000",
  "rewardAmount": null,
  "fetchType": "A",
  "updatedAt": "<실행 시점>"
}
```

**snapshotDate 결정 근거**: KST 2026-02-26 11:00 = UTC 2026-02-26 02:00 → 날짜 기준 "2026-02-26"

---

## 4. 구현 범위

- `src/db/seed.ts` — `seedBalanceSnapshot()` 함수 추가 + `main()` 호출
- 새로운 파일/의존성 추가 없음

---

## 5. 검증 기준 (DoD)

- [ ] `npm run db:init` 실행 후 `balance_snapshots`에 avail 2026-02-26 레코드 존재
- [ ] `npm run cli -- --chain avail --date 2026-02-27 --dry-run` 실행 시 rewardAmount 값 출력
- [ ] 중복 실행 시 오류 없이 upsert 처리
- [ ] `npx tsc --noEmit` 에러 없음
