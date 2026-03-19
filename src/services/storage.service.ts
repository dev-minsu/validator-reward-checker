import { getDb } from '@/db/client';
import { logger } from '@/utils/logger';
import type { SnapshotData } from '@/fetchers/base.fetcher';

export interface WithdrawalRecord {
  projectId: string;
  withdrawnAt: string; // "YYYY-MM-DD"
  amount: string;      // human 단위 string
}

export class StorageService {
  async saveSnapshot(data: SnapshotData & { rewardAmount: string | null }): Promise<void> {
    const db = getDb();
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

  async getWithdrawals(projectId: string, date: string): Promise<WithdrawalRecord[]> {
    const db = getDb();
    return db
      .collection<WithdrawalRecord>('withdrawal_records')
      .find({ projectId, withdrawnAt: date })
      .toArray();
  }
}
