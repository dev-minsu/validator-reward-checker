# Validator Reward Updater — PRD

> 설계 상세: [ARCHITECTURE.md](./ARCHITECTURE.md) | 구현 태스크: [TASK.md](./TASK.md) | 개발 가이드: [CLAUDE.md](./CLAUDE.md)

---

## 1. 배경 및 목적

### 문제
DeSpread는 현재 7개 블록체인 네트워크에서 validator/signer 노드를 운영하며, 각 노드의 리워드를 **매월 수동으로 스프레드시트에 기록**하고 있다. 이 방식은 다음과 같은 한계를 가진다:

- 수동 입력으로 인한 **오류 가능성**
- 월 1회 스냅샷으로 인한 **데이터 지연 및 낮은 해상도**
- 체인 수 증가 시 **확장 불가**
- 리워드 이상 발생 시 **즉각 감지 불가**
- 인출(withdrawal) 발생 시 수동 보정 필요

### 목표
7개 체인의 validator 리워드를 **자동으로 수집·저장·보고**하는 시스템을 구축하여 수동 관리를 완전히 대체한다.
Avail(Type A)을 우선 구현하고, 이후 나머지 체인으로 확장한다.

---

## 2. 리워드 추적 방식 분류

### Type A — 온체인 잔고 기간 차이 (Balance Period Diff)
설정된 기간의 시작 잔고와 종료 잔고 차이에 기간 내 인출액을 더해 리워드를 계산한다.
인출 기록은 Subscan 등 블록체인 인덱서 API를 통해 자동 조회한다.

```
기간 리워드 = (기간 종료 잔고 + 기간 내 인출 합산) − 기간 시작 잔고
```

- 장점: 구현 단순, 인출 자동 집계로 수동 입력 불필요
- 단점: 리워드 유형 구분 불가
- **해당 체인**: Avail (Substrate JSON-RPC)

### Type B — Core Layer API 스테이킹 잔고 조회
체인 자체의 REST API 또는 SDK를 통해 staking 잔고를 조회한다.

```
기간 리워드 = (기간 종료 staking 잔고 + 기간 내 언스테이킹/출금액) − 기간 시작 staking 잔고
```

- **해당 체인**: Stacks (Hiro REST API), Story (Cosmos SDK staking REST), Hyperliquid (자체 validator API)

### Type C — Token Transfer (ERC-20 tx) 집계
validator 주소로 입금된 ERC-20 토큰 전송 트랜잭션 목록을 조회하고 합산한다.

```
기간 리워드 = Σ (기간 내 수신된 리워드 토큰 전송 금액)
```

- **해당 체인**: Bera (BGT Reward Vault), Infrared (iBERA), Monad (MON)

---

## 3. 지원 네트워크

| 프로젝트 | 토큰 | 추적 타입 | 시작일 | 데이터 소스 |
|---|---|---|---|---|
| Avail Validator | AVAIL | **Type A** | 2025-01-20 | Substrate JSON-RPC (polkadot.js) + Subscan |
| Stacks Signer | BTC | **Type B** | 2024-04-29 | Hiro REST API |
| Story Validator | IP | **Type B** | 2025-03-05 | Cosmos SDK staking REST |
| Bera Validator | BGT | **Type C** | 2025-02-06 | BGT Reward Vault 컨트랙트 이벤트 |
| Infrared Bera Validator | iBERA | **Type C** | 2025-04-21 | iBERA ERC-20 Transfer 이벤트 |
| Hyperliquid | HYPE | **Type B** | 2025-04-22 | Hyperliquid validator REST API |
| Monad | MON | **Type C** | 2025-11-13 | ERC-20 Transfer 이벤트 (테스트넷) |

---

## 4. 핵심 기능 요구사항

### F-01. 주기적 잔고 수집 (Collect)
- **설정 가능한 cron** (`BALANCE_COLLECTION_CRON`, 기본: `"0 * * * *"` = 매시 정각)으로 자동 실행
- 각 체인별 fetcher가 독립적으로 온체인 잔고를 조회
- 조회 결과를 `balance_history` 컬렉션에 저장 (TTL 90일 자동 삭제)
- 조회 실패 시 최대 **3회 재시도** (exponential backoff: 1s → 2s → 4s)
- 한 체인 실패가 전체 실행을 중단하지 않음
- 에러 발생 시 Slack 알림

### F-02. 기간 기반 리워드 계산
- Type별 계산 공식 적용 (섹션 2 참조)
- 기간 내 인출(withdrawal)은 인덱서 API(Subscan 등)를 통해 **자동 조회**하여 보정
- 인덱서 조회 결과는 `withdrawal_records`에 원본 응답 포함 저장 (무결성 보장)
- 동일 기간 재조회 시 `indexer_query_cache` 마커로 API 재호출 방지
  - **인출이 0건인 기간도 캐싱**: 빈 결과 캐시를 통해 불필요한 API 재호출 완전 차단

### F-03. MongoDB 저장
- 잔고 수집 결과: `balance_history` (TTL 90일)
- 인출 기록: `withdrawal_records` (영구 보관, 원본 응답 포함)
- 조회 완료 마커: `indexer_query_cache` (count=0 포함, 빈 결과 재조회 방지)
- 리포트 결과: `reward_reports` (영구 보관)

### F-04. 월단위 리포트 (Report)
- **설정 가능한 cron** (`REPORT_CRON`, 기본: `"0 0 26 * *"` = 매월 26일 00:00 KST)으로 자동 실행
- CLI에서 수동 트리거 가능, 날짜 범위 지정 지원:

  | CLI 인수 | 보고 기간 |
  |---------|---------|
  | `--beg DATE --end DATE` | 지정 범위 |
  | `--beg DATE` | DATE ~ 어제 23:59:59 KST |
  | (없음) | 전월 `REPORT_DEFAULT_START_DAY`일 ~ 어제 23:59:59 KST |

- 결과를 CSV 형식으로 출력 (stdout 또는 `--output FILE`)
- Slack 으로 리포트 요약 전송

### F-05. Slack 알림
- **리포트 완료** 시: 기간, 리워드 금액, 체인별 요약 전송
- **에러 발생** 시: 체인명, 에러 내용 전송

### F-06. 수동 보정 도구
- 잔고 수동 입력: `--add-balance --chain --time --balance` (수집 데이터 누락 시)
- 수동 인출 등록: `withdrawal_records` 직접 삽입 (인덱서 API 없는 경우 대비)

### F-07. 통합 스케줄러
- 잔고 수집 cron + 리포트 생성 cron을 하나의 프로세스에서 관리
- 각 cron은 독립적으로 실행 (실패해도 다른 cron 영향 없음)

---

## 5. 비기능 요구사항

| 항목 | 요구사항 |
|---|---|
| 언어/런타임 | Node.js 20 LTS, TypeScript strict 모드 |
| DB | MongoDB 7+ |
| 오류 격리 | 체인별 fetcher 독립 실행 |
| 재시도 | 최대 3회, exponential backoff |
| 보안 | 모든 민감 정보 환경 변수 관리 |
| 로깅 | 구조화 로그 (JSON, pino) |
| 테스트 | fetcher 단위 테스트 (mock), 계산 로직 테스트, 서비스 테스트 |
| 시간대 | 저장은 UTC, 표시/계산 경계는 KST → UTC 변환 후 처리 |

---

## 6. Slack 알림 형식

**리포트 완료:**
```
📊 Validator Reward Report — 2026-02-26 ~ 2026-03-25
──────────────────────────────────────────────────────
Avail   기간 리워드: +1,234.56 AVAIL
        시작 잔고:   648,173.78 AVAIL (2026-02-26 00:00 KST)
        종료 잔고:   649,408.34 AVAIL (2026-03-25 23:59 KST)
        인출 보정:   +0.00 AVAIL
──────────────────────────────────────────────────────
✅ 리포트 생성 완료
```

**에러 발생:**
```
❌ [avail] 잔고 수집 실패 — 2026-03-25 15:00 UTC
RPC timeout after 3 retries
```

---

## 7. 마일스톤

| Phase | 내용 | 상태 |
|---|---|---|
| **Phase 1** | 프로젝트 설정 + 공통 인프라 + **Avail 잔고 수집 (Type A)** | ✅ 완료 |
| **Phase 2** | 리포트 시스템: balance_history, IndexerService, ReportService, SlackService, 통합 스케줄러 | 진행 중 |
| **Phase 3** | Type B fetchers: Stacks, Story, Hyperliquid | 예정 |
| **Phase 4** | Type C fetchers: Bera, Infrared, Monad | 예정 |
| **Phase 5** | 테스트 강화 + 모니터링 + 오류 처리 | 예정 |

---

## 8. 미결 사항 (Open Questions)

- [ ] Monad 메인넷 출시 일정 확인 → 테스트넷 fetcher 전환 시점
- [ ] Bera/Infrared Reward Vault 컨트랙트 주소 확인
- [ ] Type C 체인에서 리워드로 수신 가능한 토큰 종류 확인 (복수 여부)
- [ ] Subscan API 무료 tier 한도 확인 (월 조회 횟수)
