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

### 목표
7개 체인의 validator 리워드를 **매일 자동으로 온체인에서 수집·저장·보고**하는 시스템을 구축하여 수동 관리를 완전히 대체한다.

---

## 2. 리워드 추적 방식 분류

체인마다 리워드를 집계하는 방법이 다르다. 세 가지 타입으로 분류한다.

### Type A — 온체인 잔고 단순 조회 (Balance Diff)
매일 validator 주소의 온체인 잔고를 직접 조회하고, 전일 대비 차이로 리워드를 계산한다.

```
일일 리워드 = (오늘 잔고 + 당일 출금액) - 어제 잔고
```

- 장점: 구현 단순, 별도 컨트랙트/API 연동 불필요
- 단점: 리워드 유형 구분 불가 (어디서 발생했는지 알 수 없음)
- **해당 체인**: Avail (Substrate JSON-RPC)

### Type B — Core Layer API 스테이킹 잔고 조회
EVM eth_getBalance 가 아닌, 체인 자체의 REST API 또는 SDK를 통해 staking 잔고를 조회한다.

```
일일 리워드 = (오늘 staking 잔고 + 당일 언스테이킹/출금액) - 어제 staking 잔고
```

- 특징: 체인 전용 SDK/API 필요, staking 모듈 쿼리 구조 이해 필요
- **해당 체인**: Stacks (Hiro REST API), Story (Cosmos SDK staking REST), Hyperliquid (자체 validator API)

### Type C — Token Transfer (ERC-20 tx) 집계
validator 주소로 입금된 ERC-20 토큰 전송 트랜잭션 목록을 조회하고 합산한다. 리워드 토큰이 여러 종류일 수 있다.

```
일일 리워드 = Σ (해당 날짜에 수신된 리워드 토큰 전송 금액)
```

- 특징: 트랜잭션 이벤트 기반, token_symbol이 복수일 수 있어 DB 구조 주의
- Block Explorer API (예: etherscan-compatible) 또는 직접 이벤트 필터링 사용
- **해당 체인**: Bera (BGT Reward Vault), Infrared (iBERA), Monad (MON)

---

## 3. 지원 네트워크

| 프로젝트 | 토큰 | 추적 타입 | 시작일 | 데이터 소스 |
|---|---|---|---|---|
| Avail Validator | AVAIL | **Type A** | 2025-01-20 | Substrate JSON-RPC (polkadot.js) |
| Stacks Signer | BTC | **Type B** | 2024-04-29 | Hiro REST API |
| Story Validator | IP | **Type B** | 2025-03-05 | Cosmos SDK staking REST |
| Bera Validator | BGT | **Type C** | 2025-02-06 | BGT Reward Vault 컨트랙트 이벤트 |
| Infrared Bera Validator | iBERA | **Type C** | 2025-04-21 | iBERA ERC-20 Transfer 이벤트 |
| Hyperliquid | HYPE | **Type B** | 2025-04-22 | Hyperliquid validator REST API |
| Monad | MON | **Type C** | 2025-11-13 | ERC-20 Transfer 이벤트 (테스트넷) |

---

## 4. 핵심 기능 요구사항

### F-01. 온체인 데이터 수집 (Daily)
- 매일 **00:00 KST** (15:00 UTC)에 크론 실행
- 각 체인별 fetcher가 독립적으로 데이터 조회 (병렬 실행)
- 조회 실패 시 최대 **3회 재시도** (exponential backoff: 1s → 2s → 4s)
- 한 체인 실패가 전체 실행을 중단하지 않음

### F-02. 리워드 계산
- Type별 계산 공식 적용 (섹션 2 참조)
- 출금(withdrawal)이 발생한 날은 출금액을 더해 보정
- Type C의 경우 동일 날짜 tx 중복 집계 방지

### F-03. PostgreSQL 저장
- 매일 잔고 스냅샷 + 리워드 계산 결과를 DB에 영구 저장
- 과거 날짜 재처리 지원 (`--date` 플래그)

### F-04. 스프레드시트 동기화
- Google Sheets API를 통해 기존 스프레드시트 자동 업데이트
- 월별 잔고 컬럼을 신규 컬럼으로 자동 추가

### F-05. Slack 알림
- 수집 완료 후 팀 채널에 일일 요약 전송
- 실패 체인이 있을 경우 별도 경고 포함

### F-06. 수동 보정
- 출금 내역 수동 등록 CLI
- 특정 날짜 재처리 기능

---

## 5. 비기능 요구사항

| 항목 | 요구사항 |
|---|---|
| 언어/런타임 | Node.js 20 LTS, TypeScript strict 모드 |
| DB | PostgreSQL 15+ |
| 오류 격리 | 체인별 fetcher 독립 실행 |
| 재시도 | 최대 3회, exponential backoff |
| 보안 | 모든 민감 정보 환경 변수 관리 |
| 로깅 | 구조화 로그 (JSON), 날짜별 파일 |
| 테스트 | fetcher 단위 테스트 (mock), 계산 로직 테스트 |

---

## 6. Slack 알림 형식

**정상 실행:**
```
📊 Validator Rewards Daily Report — 2025-03-17
──────────────────────────────────────────────
Avail        +1,234.56  AVAIL   잔고: 649,408.34   [Type A]
Stacks       +0.000480  BTC     잔고: 0.693670      [Type B]
Story        +46.71     IP      잔고: 3,966.78      [Type B]
Bera         +38.64     BGT     잔고: 1,197.83      [Type C]
Infrared     +31.27     iBERA   잔고: 969.27        [Type C]
Hyperliquid  +89.00     HYPE    잔고: 12,495.00     [Type B]
Monad        +5,175.74  MON     잔고: 337,469.94    [Type C]
──────────────────────────────────────────────
✅ 7/7 chains updated successfully
```

**일부 실패:**
```
⚠️ Validator Rewards — 2025-03-17 (일부 실패)
✅ 6/7 chains updated
❌ Avail: RPC timeout after 3 retries
```

---

## 7. 마일스톤

| Phase | 내용 | 비고 |
|---|---|---|
| **Phase 1** | 프로젝트 설정 + DB 스키마 + **Avail fetcher (Type A)** | 현재 착수 |
| **Phase 2** | Type B fetchers: Stacks, Story, Hyperliquid | |
| **Phase 3** | Type C fetchers: Bera, Infrared, Monad | |
| **Phase 4** | Slack 알림 + Google Sheets 동기화 | |
| **Phase 5** | 테스트 강화 + 모니터링 + 오류 처리 | |

---

## 8. 미결 사항 (Open Questions)

- [ ] Monad 메인넷 출시 일정 확인 → 테스트넷 fetcher 전환 시점
- [ ] Bera/Infrared Reward Vault 컨트랙트 주소 확인
- [ ] Google Sheets 기존 파일 공유 (Service Account 이메일 등록)
- [ ] Type C 체인에서 리워드로 수신 가능한 토큰 종류 확인 (복수 여부)
- [ ] 출금 내역 입력 방식 결정: CLI vs Slack 명령어 vs DB 직접 삽입
