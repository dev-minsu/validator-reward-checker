# Design: seed-balance

> **Feature**: `seed-balance`
> **Phase**: Design
> **작성일**: 2026-03-24
> **작성자**: Claude Code

---

## 1. 구현 범위

`src/db/seed.ts` 파일에 `seedBalanceSnapshot()` 함수를 추가하고 `main()`에서 호출.

새 파일 / 새 의존성 없음.

---

## 2. 함수 명세

### `seedBalanceSnapshot(db: Db): Promise<void>`

| 항목 | 내용 |
|------|------|
| 파일 | `src/db/seed.ts` |
| 역할 | `balance_snapshots`에 Avail 2026-02-26 기준 잔고 삽입 |
| 방식 | `replaceOne` + `{ upsert: true }` (기존 패턴 일치) |
| 필터 | `{ projectId: 'avail', snapshotDate: '2026-02-26' }` |

### 삽입 Document

```typescript
{
  projectId:    'avail',
  snapshotDate: '2026-02-26',
  balance:      '648173780900000000000000',  // planck string
  rewardAmount: null,                         // 기준점, 리워드 없음
  fetchType:    'A',
  updatedAt:    new Date(),                   // 실행 시점
}
```

---

## 3. `main()` 변경

기존 `main()` 끝에 추가 (closeDb 호출 전):

```typescript
console.log('[seed] Seeding historical balance snapshot (avail 2026-02-26)...');
await seedBalanceSnapshot(db);
console.log('[seed] Historical snapshot seeded.');
```

---

## 4. 타입 정의

`BalanceSnapshotSeed` 인터페이스를 seed.ts 내부에 정의:

```typescript
interface BalanceSnapshotSeed {
  projectId:    string;
  snapshotDate: string;
  balance:      string;
  rewardAmount: string | null;
  fetchType:    'A' | 'B' | 'C';
  updatedAt:    Date;
}
```

---

## 5. 검증 기준 (DoD)

- [ ] `npm run db:init` 실행 후 `balance_snapshots`에 avail 2026-02-26 레코드 존재
- [ ] `rewardAmount: null`, `balance: "648173780900000000000000"`, `fetchType: "A"` 확인
- [ ] 중복 실행 시 오류 없이 upsert 처리
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] `npm test` 통과
