import { getDb } from '@/db/client';
import { logger } from '@/utils/logger';
import type { SnapshotData } from '@/fetchers/base.fetcher';

export interface WithdrawalRecord {
  projectId: string;
  withdrawnAt: string; // "YYYY-MM-DD"
  amount: string;      // human 단위 string
}

export class StorageService {
  async saveSnapshot(data: Omit<SnapshotData, 'rewardAmount'> & { rewardAmount?: string | null }): Promise<void> {
    const db = await getDb();
    const doc = {
      projectId: data.projectId,
      snapshotDate: data.snapshotDate,
      balance: data.balance ?? null,
      rewardAmount: data.rewardAmount,
      fetchType: data.fetchType,
      updatedAt: new Date(),
    };

    await db.collection('balance_snapshots').replaceOne(
      { projectId: data.projectId, snapshotDate: data.snapshotDate },
      doc,
      { upsert: true },
    );

    logger.info(
      { projectId: data.projectId, snapshotDate: data.snapshotDate, rewardAmount: data.rewardAmount },
      'snapshot saved',
    );
  }

  async getSnapshot(projectId: string, snapshotDate: string): Promise<{ balance: string } | null> {
    const db = await getDb();
    return db
      .collection<{ balance: string }>('balance_snapshots')
      .findOne({ projectId, snapshotDate });
  }

  async getWithdrawals(projectId: string, fromDate: string, toDate: string): Promise<WithdrawalRecord[]> {
    const db = await getDb();
    return db
      .collection<WithdrawalRecord>('withdrawal_records')
      .find({ projectId, withdrawnAt: { $gte: fromDate, $lte: toDate } })
      .toArray();
  }

  // ── balance_history (신규) ──────────────────────────────────

  async saveBalanceHistory(data: {
    projectId: string;
    snapshotAt: Date;
    balance: string;
    fetchType: 'A' | 'B' | 'C';
  }): Promise<void> {
    const db = await getDb();
    const doc = {
      projectId: data.projectId,
      snapshotAt: data.snapshotAt,
      balance: data.balance,
      fetchType: data.fetchType,
      createdAt: new Date(),
    };
    await db.collection('balance_history').replaceOne(
      { projectId: data.projectId, snapshotAt: data.snapshotAt },
      doc,
      { upsert: true },
    );
    logger.info(
      { projectId: data.projectId, snapshotAt: data.snapshotAt.toISOString() },
      'balance history saved',
    );
  }

  async getSnapshotAt(
    projectId: string,
    beforeOrAt: Date,
  ): Promise<{ balance: string; snapshotAt: Date } | null> {
    const db = await getDb();
    return db
      .collection<{ balance: string; snapshotAt: Date }>('balance_history')
      .findOne(
        { projectId, snapshotAt: { $lte: beforeOrAt } },
        { sort: { snapshotAt: -1 } },
      );
  }
}
