# Plan: Phase 1-1 — 프로젝트 기반 설정

> **Feature**: `phase1-1-project-setup`
> **Phase**: Plan
> **작성일**: 2026-03-18
> **참고 문서**: [PRD.md](../../PRD.md) | [ARCHITECTURE.md](../../ARCHITECTURE.md) | [TASK.md](../../TASK.md)

---

## 1. 목표 (Objective)

Validator Reward Updater 프로젝트의 실행 가능한 기반 환경을 구성한다. 이후 모든 Phase의 코드가 일관된 TypeScript 설정, 코드 품질 도구, 환경 변수 관리 위에서 동작할 수 있도록 초기 뼈대를 완성한다.

---

## 2. 배경 및 이유 (Background)

- 현재 프로젝트 디렉토리에는 문서 파일(PRD.md, ARCHITECTURE.md, CLAUDE.md, TASK.md)만 존재
- 소스 코드 작성 전에 TypeScript 컴파일러, 린터, 포맷터, 의존성 설정이 선행되어야 함
- 환경 변수는 총 15개 이상(체인별 RPC URL, 지갑 주소, DB URI 등)으로, `.env.example` 없이는 협업 및 배포가 불가능
- MongoDB native driver + polkadot.js 등 핵심 런타임 패키지의 버전 고정이 재현 가능한 빌드의 전제 조건

---

## 3. 범위 (Scope)

### In Scope

| 항목 | 설명 |
|------|------|
| `package.json` 초기화 | Node.js 20, TypeScript 프로젝트 메타 + npm scripts 정의 |
| `tsconfig.json` | `strict: true`, path alias `@/` → `src/`, ES2022 target |
| ESLint 설정 | TypeScript ESLint 규칙, `any` 금지 등 |
| Prettier 설정 | 코드 포맷 자동화 |
| `.env.example` | ARCHITECTURE.md 환경 변수 전체 목록 (15개 변수) |
| `.gitignore` | `.env`, `dist/`, `node_modules/` 등 |
| 의존성 설치 | runtime 6종 + dev 4종 |

### Out of Scope

- DB 연결 코드 (`src/db/client.ts`) — Phase 1-2에서 처리
- 공통 유틸리티 (`src/utils/`) — Phase 1-3에서 처리
- Fetcher 구현 — Phase 1-4에서 처리

---

## 4. 요구사항 (Requirements)

### 기능 요구사항

| ID | 요구사항 |
|----|----------|
| R-01 | `npm run build`가 에러 없이 완료되어야 함 |
| R-02 | `npm test`가 vitest로 실행되어야 함 (테스트 파일 없어도 exit 0) |
| R-03 | `npm run lint`가 에러 없이 완료되어야 함 |
| R-04 | `npm run format`이 Prettier 포맷을 적용해야 함 |
| R-05 | `@/` path alias가 `src/`를 가리켜야 함 (`tsconfig.json` + vitest 모두) |
| R-06 | `.env.example`에 ARCHITECTURE.md 기준 모든 환경 변수가 주석과 함께 포함되어야 함 |
| R-07 | `.gitignore`에 `.env`, `dist/`, `node_modules/`, `*.log` 포함 |

### 비기능 요구사항

| ID | 요구사항 |
|----|----------|
| NR-01 | TypeScript `strict: true` — `any` 사용 시 lint 에러 |
| NR-02 | Node.js 20 LTS 기준 (`engines` 필드 명시) |
| NR-03 | `package.json`의 `type: "module"` 사용 여부 결정 (CommonJS vs ESM) |

---

## 5. 기술 결정 사항 (Technical Decisions)

### 5-1. 모듈 시스템: CommonJS 채택

- `polkadot/api`와 일부 패키지의 ESM 호환성 이슈를 피하기 위해 **CommonJS** 사용
- `tsconfig.json`의 `module: "commonjs"`, `ts-node` 기반 실행

### 5-2. 의존성 목록

**Runtime**
```
@polkadot/api       ^12.x   Substrate RPC 연결
mongodb             ^6.x    MongoDB native driver
node-cron           ^3.x    크론 스케줄러
pino                ^9.x    구조화 로그
bignumber.js        ^9.x    고정밀 소수 연산
zod                 ^3.x    환경 변수 검증
```

**Dev**
```
typescript          ^5.x
vitest              ^2.x
ts-node             ^10.x
@types/node         ^20.x
eslint              ^9.x
@typescript-eslint/eslint-plugin  ^8.x
@typescript-eslint/parser         ^8.x
prettier            ^3.x
```

### 5-3. npm scripts

```json
{
  "build":    "tsc --project tsconfig.json",
  "dev":      "ts-node src/index.ts",
  "cli":      "ts-node src/cli.ts",
  "test":     "vitest run",
  "lint":     "eslint src tests --ext .ts",
  "format":   "prettier --write src tests",
  "db:init":  "ts-node src/db/seed.ts"
}
```

### 5-4. tsconfig path alias

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

vitest에서도 `alias: { '@': './src' }` 설정 필요 (`vitest.config.ts` 또는 `vite.config.ts`).

---

## 6. 파일 목록 (Deliverables)

| 파일 | 설명 |
|------|------|
| `package.json` | 프로젝트 메타 + 의존성 + scripts |
| `tsconfig.json` | TypeScript 컴파일러 설정 |
| `eslint.config.js` | ESLint flat config (ESLint v9) |
| `.prettierrc` | Prettier 설정 |
| `.env.example` | 환경 변수 템플릿 (15개) |
| `.gitignore` | Git 무시 파일 목록 |
| `vitest.config.ts` | Vitest 설정 (path alias 포함) |

---

## 7. 완료 기준 (Definition of Done)

- [ ] `npm install` 성공 (의존성 설치 에러 없음)
- [ ] `npm run build` 성공 (빈 `src/index.ts`라도 컴파일 통과)
- [ ] `npm test` 실행 시 exit 0 (테스트 없어도 정상 종료)
- [ ] `npm run lint` 에러 0건
- [ ] `@/utils/logger` 형태의 import가 tsconfig에서 해석됨
- [ ] `.env.example`에 ARCHITECTURE.md의 모든 환경 변수 포함
- [ ] `.env` 파일이 `.gitignore`에 의해 추적 제외됨

---

## 8. 리스크 및 고려사항

| 리스크 | 대응 |
|--------|------|
| `@polkadot/api` ESM/CJS 혼용 이슈 | CommonJS 채택으로 회피 |
| ESLint v9 flat config 문법 미숙지 | eslint.config.js 직접 작성, legacy .eslintrc 사용 안 함 |
| `ts-node` + path alias 미작동 | `tsconfig-paths` 패키지 추가 또는 `ts-node/register` 활용 검토 |

---

## 9. 다음 Phase 연계

이 Phase 완료 후 → **Phase 1-2 (DB 설정)**: `src/db/client.ts` MongoDB 연결 + `src/db/seed.ts` 인덱스/시드 작성
