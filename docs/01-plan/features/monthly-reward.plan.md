# Plan: monthly-reward

> **Feature**: `monthly-reward`
> **Phase**: Plan
> **작성일**: 2026-03-24
> **작성자**: Claude Code

---

## 1. 배경 및 목적

### 문제

현재 `rewardAmount` 계산은 **하루 단위** (오늘 잔고 - 어제 잔고 + 당일 출금액).
그러나 실제 운영에서는 **매월 특정 기준일(26일)** 기준으로 월단위 리워드를 집계해야 한다.
또한 기준일은 설정으로 변경 가능해야 한다.

### 목표

- 리워드 계산 주기를 **월단위**로 변경
- 기준일(`REWARD_CYCLE_DAY`)을 환경 변수로 설정 가능
- 기준일에만 `rewardAmount` 계산, 그 외 날짜는 잔고만 저장 (`rewardAmount = null`)

---

## 2. 리워드 계산 공식

```
rewardAmount = (이번달 N일 잔고) - (지난달 N일 잔고) + (지난달 N+1일 ~ 이번달 N일 출금액 합산)
```

예시 (`REWARD_CYCLE_DAY=26`):
- 오늘 `2026-03-26`: 이전 `2026-02-26` 스냅샷 조회, 출금 기간 `2026-02-27 ~ 2026-03-26`
- 오늘 `2026-03-24` (비기준일): `rewardAmount = null`, 잔고만 저장

---

## 3. 요구사항

### Functional Requirements

| ID | 요구사항 |
|----|---------|
| FR-01 | `REWARD_CYCLE_DAY` 환경 변수로 기준일 설정 (기본값: 26, 범위: 1~28) |
| FR-02 | CLI 실행 날짜가 기준일인 경우에만 `rewardAmount` 계산 |
| FR-03 | 비기준일 실행 시 잔고만 저장, `rewardAmount = null` |
| FR-04 | 출금 조회를 단일 날짜 → 날짜 범위(`fromDate ~ toDate`)로 변경 |
| FR-05 | `getSnapshot(projectId, snapshotDate)` 헬퍼를 storage service에 추가 |

### Non-Functional Requirements

- TypeScript strict 준수
- 기존 `calculateTypeA` 함수 로직 재사용 (입력값만 변경)
- 테스트 커버리지 80% 이상 유지

---

## 4. 구현 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/config/env.ts` | `REWARD_CYCLE_DAY` 추가 (기본값 26, 1~28 범위) |
| `src/services/storage.service.ts` | `getWithdrawals` 날짜 범위로 변경, `getSnapshot` 헬퍼 추가 |
| `src/cli.ts` | 월단위 기준일 판별 및 이전 기준일 계산 로직 추가 |
| `.env.example` | `REWARD_CYCLE_DAY=26` 추가 |

---

## 5. 검증 기준 (DoD)

- [ ] `REWARD_CYCLE_DAY=26`일 때 `--date 2026-03-26` → `rewardAmount` 계산됨
- [ ] `REWARD_CYCLE_DAY=26`일 때 `--date 2026-03-24` → `rewardAmount = null`
- [ ] `2026-02-26` 시드 잔고 기반으로 `2026-03-26` 리워드 계산 가능
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] `npm test` 전체 통과
