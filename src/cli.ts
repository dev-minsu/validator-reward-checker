import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { getDb, closeDb } from '@/db/client';
import { AvailFetcher } from '@/fetchers/avail.fetcher';
import { calculateTypeA } from '@/services/reward-calculator';
import { StorageService } from '@/services/storage.service';

// suppress unused import warning — env import triggers zod validation at startup
void env;

function parseArgs(argv: string[]): { chain: string; date: string; dryRun: boolean } {
  const args = argv.slice(2);
  const chainIdx = args.indexOf('--chain');
  const dateIdx = args.indexOf('--date');
  const chain = chainIdx !== -1 ? (args[chainIdx + 1] ?? 'all') : 'all';
  const date =
    dateIdx !== -1
      ? (args[dateIdx + 1] ?? new Date().toISOString().slice(0, 10))
      : new Date().toISOString().slice(0, 10);
  const dryRun = args.includes('--dry-run');
  return { chain, date, dryRun };
}

async function runChain(chain: string, date: string, dryRun: boolean): Promise<void> {
  const fetcher = new AvailFetcher();
  const storage = new StorageService();

  const result = await fetcher.fetch(date);
  if (!result.ok) {
    logger.error({ chain, date, error: result.error }, 'fetch failed');
    return;
  }

  const { data } = result;
  const db = getDb();

  // 어제 날짜 계산
  const yesterdayDate = new Date(date);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  const yesterdayDoc = await db
    .collection<{ balance: string }>('balance_snapshots')
    .findOne({ projectId: data.projectId, snapshotDate: yesterdayStr });

  const withdrawals = await storage.getWithdrawals(data.projectId, date);
  const withdrawalAmounts = withdrawals.map((w) => w.amount);

  const rewardAmount = calculateTypeA(
    data.balance ?? '0',
    yesterdayDoc?.balance ?? null,
    withdrawalAmounts,
  );

  logger.info({ chain, date, balance: data.balance, rewardAmount }, 'result');

  if (dryRun) {
    console.log(JSON.stringify({ chain, date, balance: data.balance, rewardAmount }, null, 2));
    return;
  }

  await storage.saveSnapshot({ ...data, rewardAmount });
}

async function main(): Promise<void> {
  const { chain, date, dryRun } = parseArgs(process.argv);
  logger.info({ chain, date, dryRun }, 'cli started');

  try {
    if (chain === 'avail' || chain === 'all') {
      await runChain('avail', date, dryRun);
    } else {
      logger.warn({ chain }, 'unknown chain');
    }
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'cli fatal error');
  process.exit(1);
});
