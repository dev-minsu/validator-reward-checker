# Design: Phase 1-1 — 프로젝트 기반 설정

> **Feature**: `phase1-1-project-setup`
> **Phase**: Design
> **작성일**: 2026-03-18
> **참고**: [Plan 문서](../../01-plan/features/phase1-1-project-setup.plan.md) | [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## 1. 파일별 상세 명세

### 1-1. `package.json`

```json
{
  "name": "validator-reward-updater",
  "version": "0.1.0",
  "description": "Daily validator reward collector for 7 blockchain networks",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "build":   "tsc --project tsconfig.json",
    "dev":     "ts-node -r tsconfig-paths/register src/index.ts",
    "cli":     "ts-node -r tsconfig-paths/register src/cli.ts",
    "test":    "vitest run",
    "lint":    "eslint src tests",
    "format":  "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\"",
    "db:init": "ts-node -r tsconfig-paths/register src/db/seed.ts"
  },
  "dependencies": {
    "@polkadot/api": "^12.4.2",
    "bignumber.js": "^9.1.2",
    "mongodb": "^6.14.2",
    "node-cron": "^3.0.3",
    "pino": "^9.6.0",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^20.17.30",
    "@types/node-cron": "^3.0.11",
    "@typescript-eslint/eslint-plugin": "^8.29.0",
    "@typescript-eslint/parser": "^8.29.0",
    "eslint": "^9.23.0",
    "prettier": "^3.5.3",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.8.2",
    "vitest": "^2.1.9"
  }
}
```

**핵심 결정:**
- `tsconfig-paths/register`를 `-r` 옵션으로 등록해야 `@/` alias가 런타임에서 작동
- `@types/node-cron` dev 의존성 추가 (타입 제공)

---

### 1-2. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**핵심 결정:**
- `target: "ES2022"` — Node.js 20의 native async/await, top-level await 지원
- `module: "commonjs"` — polkadot.js ESM 혼용 이슈 회피
- `strict: true` — `any` 사용 시 컴파일 에러
- `baseUrl: "."`, `paths: { "@/*": ["src/*"] }` — path alias 설정

---

### 1-3. `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**핵심 결정:**
- `globals: true` — `describe`, `it`, `expect` 등을 import 없이 사용
- `resolve.alias` — vitest에서도 `@/` alias 작동

---

### 1-4. `eslint.config.js` (ESLint v9 flat config)

```javascript
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'warn',
    },
  },
];
```

> **주의**: ESLint v9 flat config는 `eslint.config.js`를 사용하며 `.eslintrc.*` 파일은 무시됨.
> `package.json`에 `"type": "module"` 없이 사용 시 `.cjs` 확장자 또는 `require()` 문법 필요.
> → CommonJS 프로젝트이므로 `eslint.config.cjs`로 저장하고 `require()` 사용.

**수정된 형태 (`eslint.config.cjs`)**:
```javascript
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
];
```

---

### 1-5. `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

---

### 1-6. `.env.example`

```env
# ── Database ──────────────────────────────────────────────────
# MongoDB 연결 URI (로컬 또는 Atlas)
MONGO_DB_URI=mongodb://localhost:27017/validator_rewards

# ── Notifications ──────────────────────────────────────────────
# Slack Incoming Webhook URL
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Google Sheets 파일 ID (URL에서 /d/{ID}/ 부분)
GOOGLE_SHEETS_ID=your_spreadsheet_id_here

# Google Service Account 키 (JSON을 base64 인코딩한 값)
# 생성: base64 -i service-account.json | tr -d '\n'
GOOGLE_SERVICE_ACCOUNT_KEY=base64_encoded_json_here

# ── Avail (Type A) — Substrate JSON-RPC ───────────────────────
AVAIL_RPC_URL=wss://mainnet.avail-rpc.com
AVAIL_WALLET_ADDRESS=

# ── Stacks (Type B) — Hiro REST API ───────────────────────────
STACKS_API_URL=https://api.mainnet.stacks.co
STACKS_WALLET_ADDRESS=

# ── Story (Type B) — Cosmos SDK staking REST ──────────────────
STORY_REST_URL=https://api.story.foundation
STORY_WALLET_ADDRESS=

# ── Hyperliquid (Type B) — 자체 validator REST API ────────────
HYPERLIQUID_API_URL=https://api.hyperliquid.xyz
HYPERLIQUID_WALLET_ADDRESS=

# ── Berachain (Type C) — BGT Reward Vault 이벤트 ──────────────
BERA_RPC_URL=https://rpc.berachain.com
BERA_WALLET_ADDRESS=
BERA_REWARD_VAULT_ADDRESS=

# ── Infrared (Type C) — iBERA ERC-20 Transfer 이벤트 ──────────
INFRARED_RPC_URL=https://rpc.berachain.com
INFRARED_WALLET_ADDRESS=
INFRARED_TOKEN_ADDRESS=

# ── Monad (Type C) — MON ERC-20 Transfer 이벤트 (테스트넷) ────
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_WALLET_ADDRESS=
```

---

### 1-7. `.gitignore`

```gitignore
# 환경 변수 (절대 커밋 금지)
.env
.env.local
.env.*.local

# 빌드 산출물
dist/

# 의존성
node_modules/

# 로그
*.log
logs/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# TypeScript 캐시
*.tsbuildinfo
```

---

### 1-8. `src/index.ts` (플레이스홀더)

빌드 통과를 위한 최소한의 진입점:

```typescript
// Entry point — Phase 4에서 크론 스케줄러 구현 예정
export {};
```

---

## 2. 구현 순서

```
1. package.json 작성
2. npm install 실행
3. tsconfig.json 작성
4. vitest.config.ts 작성
5. eslint.config.cjs 작성
6. .prettierrc 작성
7. .env.example 작성
8. .gitignore 작성
9. src/index.ts 플레이스홀더 생성
10. npm run build 검증
11. npm test 검증
12. npm run lint 검증
```

---

## 3. 검증 체크리스트

| 검증 항목 | 명령어 | 기대 결과 |
|-----------|--------|-----------|
| 빌드 통과 | `npm run build` | `dist/index.js` 생성, 에러 0 |
| 테스트 실행 | `npm test` | exit 0 (테스트 없음) |
| 린트 통과 | `npm run lint` | 에러 0 |
| path alias | `@/` import 사용 | ts-node + vitest 모두 정상 |
| .env 제외 | `git status` | `.env` 추적 안 됨 |

---

## 4. 의존성 호환성 메모

| 패키지 | 버전 고정 이유 |
|--------|---------------|
| `@polkadot/api` | ESM/CJS 혼용 이슈 — 최신 v12 stable |
| `vitest` | `^2.x` — Node 20 지원, `globals: true` 옵션 |
| `ts-node` | `^10.x` — `-r tsconfig-paths/register` 지원 |
| `eslint` | `^9.x` — flat config 사용, `.eslintrc` 지원 종료 |
