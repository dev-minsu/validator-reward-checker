import { z } from 'zod';

const envSchema = z.object({
  // MongoDB — optional at startup, required when DB is accessed
  MONGO_DB_URI: z.string().min(1).optional(),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // 월단위 리워드 기준일 (legacy, 1~28, 기본 26)
  REWARD_CYCLE_DAY: z.coerce.number().int().min(1).max(28).default(26),

  // ── 스케줄러 ─────────────────────────────────────────────────
  BALANCE_COLLECTION_CRON: z.string().default('0 * * * *'),
  REPORT_CRON: z.string().default('0 0 26 * *'),
  REPORT_DEFAULT_START_DAY: z.coerce.number().int().min(1).max(28).default(26),

  // ── 외부 API (optional at startup) ──────────────────────────
  AVAIL_SUBSCAN_API_KEY: z.string().min(1).optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

const _result = envSchema.safeParse(process.env);
if (!_result.success) {
  console.error('[env] Environment validation failed:');
  for (const issue of _result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
export const env: Env = _result.data;

/**
 * 특정 환경변수가 설정되어 있음을 보장하고 반환.
 * DB 접근 시점에 MONGO_DB_URI 등을 검증하기 위해 사용.
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const val = env[key];
  if (val === undefined || val === null) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val as NonNullable<Env[K]>;
}
