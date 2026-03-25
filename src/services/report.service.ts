import BigNumber from 'bignumber.js';
import { getDb } from '@/db/client';
import { logger } from '@/utils/logger';
import type { StorageService } from './storage.service';
import type { IndexerService } from './indexer.service';

export interface RewardReport {
  projectId: string;
  periodStart: Date;
  periodEnd: Date;
  balanceStart: string;     // planck
  balanceEnd: string;       // planck
  totalWithdrawals: string; // planck
  rewardAmount: string;     // planck
  withdrawalCount: number;
  generatedAt: Date;
  version: number;
}

export class ReportService {
  constructor(
    private readonly storage: StorageService,
    private readonly indexer: IndexerService,
  ) {}

  async generate(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
    opts: { dryRun?: boolean } = {},
  ): Promise<RewardReport> {
    // 1. 경계 잔고 조회
    const startSnap = await this.storage.getSnapshotAt(projectId, periodStart);
    if (!startSnap) {
      throw new Error(
        `No balance snapshot found at or before ${periodStart.toISOString()} for ${projectId}`,
      );
    }

    const endSnap = await this.storage.getSnapshotAt(projectId, periodEnd);
    if (!endSnap) {
      throw new Error(
        `No balance snapshot found at or before ${periodEnd.toISOString()} for ${projectId}`,
      );
    }

    // 2. 인출 기록 조회
    const withdrawals = await this.indexer.fetchWithdrawals(projectId, periodStart, periodEnd);
    const totalWithdrawals = withdrawals
      .reduce((sum, w) => sum.plus(w.amount), new BigNumber(0))
      .toFixed(0);

    // 3. rewardAmount = (balanceEnd + totalWithdrawals) − balanceStart
    const rewardAmount = new BigNumber(endSnap.balance)
      .plus(totalWithdrawals)
      .minus(startSnap.balance)
      .toFixed(0);

    logger.info(
      { projectId, balanceStart: startSnap.balance, balanceEnd: endSnap.balance, totalWithdrawals, rewardAmount },
      'reward calculated',
    );

    let version = 1;
    if (!opts.dryRun) {
      const db = await getDb();
      const existing = await db
        .collection<{ version: number }>('reward_reports')
        .findOne({ projectId, periodStart });
      if (existing) version = existing.version + 1;

      const report: RewardReport = {
        projectId,
        periodStart,
        periodEnd,
        balanceStart: startSnap.balance,
        balanceEnd: endSnap.balance,
        totalWithdrawals,
        rewardAmount,
        withdrawalCount: withdrawals.length,
        generatedAt: new Date(),
        version,
      };

      await db.collection('reward_reports').replaceOne(
        { projectId, periodStart },
        report,
        { upsert: true },
      );
      logger.info({ projectId, version }, 'reward report saved');
      return report;
    }

    return {
      projectId,
      periodStart,
      periodEnd,
      balanceStart: startSnap.balance,
      balanceEnd: endSnap.balance,
      totalWithdrawals,
      rewardAmount,
      withdrawalCount: withdrawals.length,
      generatedAt: new Date(),
      version,
    };
  }

  toCsv(report: RewardReport): string {
    const header =
      'projectId,periodStart,periodEnd,balanceStart,balanceEnd,totalWithdrawals,rewardAmount,withdrawalCount';
    const row = [
      report.projectId,
      report.periodStart.toISOString(),
      report.periodEnd.toISOString(),
      report.balanceStart,
      report.balanceEnd,
      report.totalWithdrawals,
      report.rewardAmount,
      String(report.withdrawalCount),
    ].join(',');
    return `${header}\n${row}\n`;
  }
}
