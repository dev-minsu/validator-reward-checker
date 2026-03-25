import cron from 'node-cron';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { withRetry } from '@/utils/retry';
import { closeDb } from '@/db/client';
import { AvailFetcher } from '@/fetchers/avail.fetcher';
import { StorageService } from '@/services/storage.service';
import { IndexerService } from '@/services/indexer.service';
import { ReportService } from '@/services/report.service';
import { SlackService } from '@/services/slack.service';
import { getDefaultPeriod } from '@/utils/date';

const AVAIL_PROJECT_ID = 'avail';
const AVAIL_TOKEN_SYMBOL = 'AVAIL';
const AVAIL_DECIMALS = 18;

const storage = new StorageService();
const indexer = new IndexerService();
const reportService = new ReportService(storage, indexer);
const slack = new SlackService();

// ── 잔고 수집 cron ─────────────────────────────────────────────

cron.schedule(env.BALANCE_COLLECTION_CRON, async () => {
  logger.info({ cron: env.BALANCE_COLLECTION_CRON }, 'balance collection started');
  const fetcher = new AvailFetcher();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const result = await withRetry(() => fetcher.fetch(today), {
      maxAttempts: 3,
      baseDelayMs: 1000,
    });
    if (result.ok && result.data.balance) {
      await storage.saveBalanceHistory({
        projectId: AVAIL_PROJECT_ID,
        snapshotAt: new Date(),
        balance: result.data.balance,
        fetchType: 'A',
      });
      logger.info({ projectId: AVAIL_PROJECT_ID, balance: result.data.balance }, 'balance collected');
    } else if (!result.ok) {
      logger.error({ chain: AVAIL_PROJECT_ID, error: result.error }, 'fetch failed');
      await slack.sendError(AVAIL_PROJECT_ID, result.error).catch((e: unknown) => {
        logger.error({ err: e }, 'slack notification failed');
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ chain: AVAIL_PROJECT_ID, err }, 'balance collection error');
    await slack.sendError(AVAIL_PROJECT_ID, msg).catch((e: unknown) => {
      logger.error({ err: e }, 'slack notification failed');
    });
  }
});

// ── 리포트 cron ────────────────────────────────────────────────

cron.schedule(env.REPORT_CRON, async () => {
  logger.info({ cron: env.REPORT_CRON }, 'report generation started');
  try {
    const { periodStart, periodEnd } = getDefaultPeriod(env.REPORT_DEFAULT_START_DAY);
    const report = await reportService.generate(AVAIL_PROJECT_ID, periodStart, periodEnd);
    await slack.sendReport(report, AVAIL_TOKEN_SYMBOL, AVAIL_DECIMALS);
    logger.info({ projectId: AVAIL_PROJECT_ID, version: report.version }, 'report generated and sent');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ chain: AVAIL_PROJECT_ID, err }, 'report generation error');
    await slack.sendError(AVAIL_PROJECT_ID, msg).catch((e: unknown) => {
      logger.error({ err: e }, 'slack notification failed');
    });
  }
});

logger.info(
  {
    balanceCollectionCron: env.BALANCE_COLLECTION_CRON,
    reportCron: env.REPORT_CRON,
  },
  'scheduler started',
);

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing DB...');
  await closeDb();
  process.exit(0);
});
