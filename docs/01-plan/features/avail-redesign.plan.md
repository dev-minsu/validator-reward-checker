# Plan: avail-redesign

> **Feature**: `avail-redesign`
> **Phase**: Plan
> **작성일**: 2026-03-25
> **작성자**: Claude Code

---

## 1. 배경 및 목적

### 문제

현재 구조의 한계:
- **일단위 잔고 차이** 방식: 하루 단위 스냅샷으로는 리워드 집계 단위가 너무 작고, 운영 중 수동 개입이 어려움
- **인출 기록 수동 관리**: withdrawal_records를 사람이 직접 입력해야 해서 누락 위험이 높음
- **월단위 보고 불가**: 현재는 "매월 X일 기준" 리포트가 불가능

### 목표

1. **시간별 잔고 수집** (수집 주기는 설정으로 변경 가능)
2. **월단위 리포트**: 사용자가 정의한 기간(기본: 전월 26일 ~ 어제)의 잔고 차이 + 인출 보정
3. **인출 자동 조회**: Subscan API를 통해 보고 기간의 인출 TX를 자동으로 조회 + DB 캐시
4. **Slack 알림**: 리포트 생성 완료 및 에러 시 알림
5. **통합 스케줄러**: cron 표현식으로 수집 + 리포트 자동화

---

## 2. 보고 기간 정의

| 인수 | 기간 |
|------|------|
| `--beg DATE --end DATE` | 지정 범위 |
| `--beg DATE` | DATE ~ 어제 23:59:59 KST |
| (없음) | 전월 `REPORT_DEFAULT_START_DAY`일 00:00 KST ~ 어제 23:59:59 KST |

**기본값 예시** (`REPORT_DEFAULT_START_DAY=26`, 오늘 2026-03-25):
- 기간 시작: 2026-02-26 00:00 KST (= 2026-02-25 15:00 UTC)
- 기간 종료: 2026-03-24 23:59:59 KST (= 2026-03-24 14:59:59 UTC)

---

## 3. 요구사항

### Functional Requirements

| ID | 요구사항 |
|----|---------|
| FR-01 | 잔고를 주기적으로 `balance_history` 컬렉션에 저장 (TTL 90일) |
| FR-02 | 수집 주기를 `BALANCE_COLLECTION_CRON` cron 표현식으로 설정 |
| FR-03 | 보고 기간 내 경계 시각에 가장 가까운 스냅샷을 기간 시작/종료 잔고로 사용 |
| FR-04 | Subscan API로 보고 기간 내 인출 TX 조회, `withdrawal_records`에 캐시 |
| FR-05 | 동일 기간 이미 조회된 인출 기록은 DB에서 반환 (재조회 방지) |
| FR-06 | 인출 기록에 Subscan 원본 응답 저장 (무결성 보장) |
| FR-07 | `rewardAmount = (balanceEnd + totalWithdrawals) − balanceStart` |
| FR-08 | 리포트를 `reward_reports`에 저장, CSV 형식으로 출력 |
| FR-09 | 리포트 완료 및 에러 시 Slack 알림 |
| FR-10 | 월단위 리포트 cron (`REPORT_CRON`)으로 자동 실행 |
| FR-11 | 수동 잔고 입력 도구: `--add-balance --chain --time --balance` |
| FR-12 | CLI `--report [--beg] [--end]` 수동 리포트 트리거 |

### Non-Functional Requirements

- KST/UTC 구분: 저장은 UTC, 표시/계산 경계는 KST → UTC 변환 후 처리
- TypeScript strict 준수
- 기존 `balance_snapshots` 컬렉션 하위 호환 유지

---

## 4. 신규 MongoDB 컬렉션

### `balance_history`
```
{
  projectId:  string,   // "avail"
  snapshotAt: Date,     // UTC timestamp
  balance:    string,   // planck string
  fetchType:  'A',
  createdAt:  Date,     // TTL 기준
}
인덱스: { projectId, snapshotAt } unique | TTL: 90일
```

### `withdrawal_records` (스키마 업데이트)
```
{
  projectId:   string,
  txHash:      string,   // unique key
  amount:      string,   // planck
  withdrawnAt: Date,     // UTC
  blockNumber: number,
  source:      'subscan',
  rawResponse: object,   // 원본 API 응답
  fetchedAt:   Date,
  periodKey:   string,   // "2026-02-26_2026-03-24" (캐시 조회용)
}
인덱스: { projectId, txHash } unique
인덱스: { projectId, periodKey }
```

### `reward_reports` (신규)
```
{
  projectId:        string,
  periodStart:      Date,
  periodEnd:        Date,
  balanceStart:     string,
  balanceEnd:       string,
  totalWithdrawals: string,
  rewardAmount:     string,
  withdrawalCount:  number,
  generatedAt:      Date,
  version:          number,
}
인덱스: { projectId, periodStart } unique
```

---

## 5. 구현 범위

### 신규 파일
| 파일 | 역할 |
|------|------|
| `src/services/indexer.service.ts` | Subscan API 연동 + DB 캐시 |
| `src/services/report.service.ts` | 리포트 생성 + CSV 출력 |
| `src/services/slack.service.ts` | Slack 알림 |

### 변경 파일
| 파일 | 변경 내용 |
|------|-----------|
| `src/config/env.ts` | 신규 환경변수 5개 추가 |
| `src/services/storage.service.ts` | `saveBalanceHistory()`, `getSnapshotAt()` 추가 |
| `src/cli.ts` | `--report`, `--add-balance` 커맨드 추가 |
| `src/index.ts` | 통합 스케줄러 (수집 + 리포트 cron) |
| `src/db/seed.ts` | `balance_history` TTL 인덱스, `reward_reports` 인덱스 추가 |
| `.env.example` | 신규 변수 추가 |
| `README.md` | Subscan API 키 발급 절차 |

### 문서 업데이트
`PRD.md`, `ARCHITECTURE.md`, `TASK.md`, `CLAUDE.md`

---

## 6. 신규 환경 변수
| 변수 | 기본값 | 설명 |
|------|--------|------|
| `BALANCE_COLLECTION_CRON` | `"0 * * * *"` | 수집 주기 cron |
| `REPORT_CRON` | `"0 0 26 * *"` | 리포트 cron (매월 26일 00:00) |
| `REPORT_DEFAULT_START_DAY` | `26` | 인수 없을 때 전월 N일을 기간 시작으로 |
| `AVAIL_SUBSCAN_API_KEY` | 필수 | Subscan API 키 |
| `SLACK_WEBHOOK_URL` | 필수 | Slack Webhook URL |

---

## 7. 검증 기준 (DoD)

- [ ] `npm run collect -- --chain avail` 실행 시 `balance_history`에 레코드 삽입
- [ ] `balance_history` TTL 인덱스 90일 설정 확인
- [ ] `npm run cli -- --report --chain avail --beg 2026-02-26 --end 2026-03-24 --dry-run` → rewardAmount 출력
- [ ] `--beg DATE` only → end = 어제 23:59:59 KST 자동 설정
- [ ] 인수 없음 → 전월 26일 ~ 어제 자동 설정
- [ ] 동일 기간 재리포트 시 withdrawal_records DB 캐시 사용 (Subscan 재호출 없음)
- [ ] Slack 알림 발송 확인 (--dry-run 제외)
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] `npm test` 전체 통과
