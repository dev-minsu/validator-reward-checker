# PDCA Completion Report: seed-balance

> **Feature**: `seed-balance`
> **Phase**: Completed
> **작성일**: 2026-03-24
> **작성자**: Claude Code
> **Match Rate**: 100%

---

## 1. 요약

`balance_snapshots` 컬렉션에 Avail 2026-02-26 기준 잔고(`648173780900000000000000` planck)를
시드 데이터로 삽입하는 기능을 구현했다. `npm run db:init` 실행 시 함께 upsert 처리되어
이후 날짜(2026-02-27~)의 CLI 실행 시 `rewardAmount` 계산이 가능해진다.

---

## 2. 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/db/seed.ts` | `BalanceSnapshotSeed` 인터페이스 + `seedBalanceSnapshot()` 함수 추가, `main()`에서 호출 |
| `docs/01-plan/features/seed-balance.plan.md` | Plan 문서 (신규) |
| `docs/02-design/features/seed-balance.design.md` | Design 문서 (신규) |
| `docs/03-analysis/seed-balance.analysis.md` | Gap Analysis 결과 (신규) |

---

## 3. 구현 내용

```typescript
// src/db/seed.ts
interface BalanceSnapshotSeed {
  projectId:    string;
  snapshotDate: string;
  balance:      string;
  rewardAmount: string | null;
  fetchType:    'A' | 'B' | 'C';
  updatedAt:    Date;
}

async function seedBalanceSnapshot(db: Db): Promise<void> {
  const doc: BalanceSnapshotSeed = {
    projectId:    'avail',
    snapshotDate: '2026-02-26',
    balance:      '648173780900000000000000',
    rewardAmount: null,
    fetchType:    'A',
    updatedAt:    new Date(),
  };
  await db.collection('balance_snapshots').replaceOne(
    { projectId: doc.projectId, snapshotDate: doc.snapshotDate },
    doc,
    { upsert: true },
  );
}
```

---

## 4. 검증 결과

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | ✅ 에러 없음 |
| `npm test` (40 cases) | ✅ 전체 통과 |
| Gap Analysis Match Rate | ✅ 100% (18/18 항목 일치) |

---

## 5. DoD 체크

- [x] `npm run db:init` 실행 후 `balance_snapshots`에 avail 2026-02-26 레코드 삽입 가능
- [x] 중복 실행 시 오류 없이 upsert 처리 (`replaceOne` + `upsert: true`)
- [x] balance planck string으로 저장 (`"648173780900000000000000"`)
- [x] `npx tsc --noEmit` 에러 없음
- [x] 기존 `npm run db:init` 명령 실행 시 함께 시드

---

## 6. 학습 및 인사이트

- 기존 `seedValidatorProjects()`가 `$setOnInsert` (최초 삽입만)를 사용한 반면,
  `seedBalanceSnapshot()`은 `replaceOne` upsert를 사용 — 재실행 시 `updatedAt` 갱신 목적
- 인터페이스를 seed.ts 내부에만 정의하여 외부 노출 없이 타입 안전성 확보
