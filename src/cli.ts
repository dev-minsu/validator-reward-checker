import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { closeDb } from '@/db/client';
import { AvailFetcher } from '@/fetchers/avail.fetcher';
import { calculateTypeA } from '@/services/reward-calculator';
import { StorageService, WithdrawalRecord } from '@/services/storage.service';
import { IndexerService } from '@/services/indexer.service';
import { ReportService } from '@/services/report.service';
import { SlackService } from '@/services/slack.service';
import { kstDateToUtc, getDefaultPeriod } from '@/utils/date';

// suppress unused import warning — env import triggers zod validation at startup
void env;

const AVAIL_TOKEN_SYMBOL = 'AVAIL';
const AVAIL_DECIMALS = 18;

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? (args[idx + 1] ?? undefined) : undefined;
}

// ── Collect (balance_history 저장) ───────────────────────────

async function runCollect(chain: string): Promise<void> {
  if (chain !== 'avail') {
    logger.warn({ chain }, 'unknown chain');
    return;
  }
  const fetcher = new AvailFetcher();
  const storage = new StorageService();
  const today = new Date().toISOString().slice(0, 10);

  const result = await fetcher.fetch(today);
  if (!result.ok) {
    logger.error({ chain, error: result.error }, 'fetch failed');
    return;
  }

  const { data } = result;
  if (!data.balance) {
    logger.warn({ chain }, 'no balance in fetch result');
    return;
  }

  const snapshotAt = new Date();
  await storage.saveBalanceHistory({
    projectId: data.projectId,
    snapshotAt,
    balance: data.balance,
    fetchType: 'A',
  });

  logger.info({ chain, balance: data.balance }, 'balance collected to balance_history');
}

// ── Report ────────────────────────────────────────────────────

async function runReport(
  chain: string,
  beg: string | undefined,
  end: string | undefined,
  dryRun: boolean,
): Promise<void> {
  const projectId = chain === 'all' ? 'avail' : chain;
  if (projectId !== 'avail') {
    logger.warn({ chain }, 'unknown chain');
    return;
  }

  const storage = new StorageService();
  const indexer = new IndexerService();
  const reportService = new ReportService(storage, indexer);
  const slack = new SlackService();

  let periodStart: Date;
  let periodEnd: Date;

  if (beg && end) {
    periodStart = kstDateToUtc(beg, '00:00:00');
    periodEnd = kstDateToUtc(end, '23:59:59');
  } else if (beg) {
    periodStart = kstDateToUtc(beg, '00:00:00');
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    periodEnd = kstDateToUtc(yesterday.toISOString().slice(0, 10), '23:59:59');
  } else {
    ({ periodStart, periodEnd } = getDefaultPeriod(env.REPORT_DEFAULT_START_DAY));
  }

  logger.info({ projectId, periodStart, periodEnd, dryRun }, 'generating report');

  const report = await reportService.generate(projectId, periodStart, periodEnd, { dryRun });
  process.stdout.write(reportService.toCsv(report));

  if (!dryRun) {
    await slack.sendReport(report, AVAIL_TOKEN_SYMBOL, AVAIL_DECIMALS);
  }
}

// ── Add Balance ───────────────────────────────────────────────

async function runAddBalance(chain: string, time: string, balance: string): Promise<void> {
  const snapshotAt = new Date(time); // ISO8601 파싱 (timezone 포함)
  if (isNaN(snapshotAt.getTime())) {
    throw new Error(`Invalid --time value: "${time}". Expected ISO8601 format.`);
  }

  const storage = new StorageService();
  await storage.saveBalanceHistory({
    projectId: chain,
    snapshotAt,
    balance,
    fetchType: 'A',
  });

  logger.info({ chain, snapshotAt: snapshotAt.toISOString(), balance }, 'balance manually added');
}

// ── Legacy collect + calculate (backward compat) ──────────────

async function runLegacy(chain: string, date: string, dryRun: boolean): Promise<void> {
  const fetcher = new AvailFetcher();
  const storage = new StorageService();

  const result = await fetcher.fetch(date);
  if (!result.ok) {
    logger.error({ chain, date, error: result.error }, 'fetch failed');
    return;
  }

  const { data } = result;
  const cycleDay = env.REWARD_CYCLE_DAY;
  const dateObj = new Date(date);
  const isMonthlyDate = dateObj.getUTCDate() === cycleDay;

  let previousDoc: { balance: string } | null = null;
  let withdrawals: WithdrawalRecord[] = [];

  if (isMonthlyDate) {
    const prevDate = new Date(dateObj);
    prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
    const previousCycleDate = prevDate.toISOString().slice(0, 10);
    const fromDateObj = new Date(prevDate);
    fromDateObj.setUTCDate(fromDateObj.getUTCDate() + 1);
    const withdrawalFromDate = fromDateObj.toISOString().slice(0, 10);
    previousDoc = await storage.getSnapshot(data.projectId, previousCycleDate);
    withdrawals = await storage.getWithdrawals(data.projectId, withdrawalFromDate, date);
  }

  const withdrawalAmounts = withdrawals.map((w) => w.amount);
  const rewardAmount = calculateTypeA(data.balance ?? '0', previousDoc?.balance ?? null, withdrawalAmounts);

  logger.info({ chain, date, balance: data.balance, rewardAmount }, 'result');

  if (dryRun) {
    logger.info({ chain, date, balance: data.balance, rewardAmount }, 'dry-run result');
    return;
  }

  await storage.saveSnapshot({ ...data, rewardAmount });
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const isReport = args.includes('--report');
  const isAddBalance = args.includes('--add-balance');
  const isCollect = args.includes('--collect');
  const dryRun = args.includes('--dry-run');
  const chain = getArg(args, '--chain') ?? 'avail';

  const mode = isReport ? 'report' : isAddBalance ? 'add-balance' : isCollect ? 'collect' : 'legacy';
  logger.info({ mode, chain }, 'cli started');

  try {
    if (isReport) {
      await runReport(chain, getArg(args, '--beg'), getArg(args, '--end'), dryRun);
    } else if (isAddBalance) {
      const time = getArg(args, '--time');
      const balance = getArg(args, '--balance');
      if (!time || !balance) throw new Error('--add-balance requires --time and --balance');
      await runAddBalance(chain, time, balance);
    } else if (isCollect) {
      await runCollect(chain);
    } else {
      // legacy: --chain --date --dry-run
      const dateIdx = args.indexOf('--date');
      const date =
        dateIdx !== -1
          ? (args[dateIdx + 1] ?? new Date().toISOString().slice(0, 10))
          : new Date().toISOString().slice(0, 10);
      const legacyChain = chain;
      if (legacyChain === 'avail' || legacyChain === 'all') {
        await runLegacy('avail', date, dryRun);
      } else {
        logger.warn({ chain: legacyChain }, 'unknown chain');
      }
    }
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'cli fatal error');
  process.exit(1);
});
