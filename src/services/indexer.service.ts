import { getDb } from '@/db/client';
import { logger } from '@/utils/logger';
import { withRetry } from '@/utils/retry';
import { requireEnv } from '@/config/env';
import { toPeriodKey } from '@/utils/date';
import { availConfig } from '@/config/networks';

const MAX_PAGES = 100;

interface IndexerQueryCache {
  projectId: string;
  periodKey:  string;
  queriedAt:  Date;
  count:      number; // 0 = 조회 완료, 인출 없음
  source:     'subscan';
}

export interface WithdrawalRecord {
  projectId: string;
  txHash: string;
  amount: string;      // planck string
  withdrawnAt: Date;   // UTC
  blockNumber: number;
  source: 'subscan';
  rawResponse: object;
  fetchedAt: Date;
  periodKey: string;
}

interface SubscanTransfer {
  hash: string;
  block_num: number;
  block_timestamp: number; // Unix timestamp (seconds)
  amount: string;
}

interface SubscanResponse {
  code: number;
  data: {
    transfers: SubscanTransfer[] | null;
    count: number;
  } | null;
  message: string;
}

export class IndexerService {
  async fetchWithdrawals(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<WithdrawalRecord[]> {
    const periodKey = toPeriodKey(periodStart, periodEnd);
    const db = await getDb();
    const col = db.collection<WithdrawalRecord>('withdrawal_records');
    const cacheCol = db.collection<IndexerQueryCache>('indexer_query_cache');

    // 1. 조회 완료 여부 확인 (빈 결과 포함)
    const cacheStatus = await cacheCol.findOne({ projectId, periodKey });
    if (cacheStatus) {
      if (cacheStatus.count === 0) {
        logger.info({ projectId, periodKey }, 'indexer cache hit (empty)');
        return [];
      }
      const cached = await col.find({ projectId, periodKey }).toArray();
      logger.info({ projectId, periodKey, count: cached.length }, 'indexer cache hit');
      return cached;
    }

    // 2. Subscan API 조회 (withRetry 3회)
    logger.info({ projectId, periodKey }, 'fetching withdrawals from subscan');
    const records = await withRetry(
      () => this._fetchFromSubscan(projectId, periodStart, periodEnd, periodKey),
      { maxAttempts: 3, baseDelayMs: 1000 },
    );

    // 3. DB 저장 (원본 응답 포함, txHash 기준 upsert)
    if (records.length > 0) {
      for (const record of records) {
        await col.replaceOne(
          { projectId: record.projectId, txHash: record.txHash },
          record,
          { upsert: true },
        );
      }
      logger.info({ projectId, periodKey, count: records.length }, 'withdrawals saved');
    }

    // 4. 조회 완료 마커 저장 (결과 0건도 포함)
    await cacheCol.replaceOne(
      { projectId, periodKey },
      { projectId, periodKey, queriedAt: new Date(), count: records.length, source: 'subscan' },
      { upsert: true },
    );

    return records;
  }

  private async _fetchFromSubscan(
    projectId: string,
    periodStart: Date,
    periodEnd: Date,
    periodKey: string,
  ): Promise<WithdrawalRecord[]> {
    const apiKey = requireEnv('AVAIL_SUBSCAN_API_KEY');
    const walletAddress = availConfig.walletAddress;

    const startMs = periodStart.getTime();
    const endMs = periodEnd.getTime();

    const allRecords: WithdrawalRecord[] = [];
    let page = 0;
    const row = 100;

    while (page < MAX_PAGES) {
      const resp = await fetch('https://avail.api.subscan.io/api/v2/scan/transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ address: walletAddress, row, page, direction: 'sent' }),
      });

      if (!resp.ok) {
        throw new Error(`Subscan API error: ${resp.status} ${resp.statusText}`);
      }

      const json = (await resp.json()) as SubscanResponse;
      if (json.code !== 0) {
        throw new Error(`Subscan error code ${json.code}: ${json.message}`);
      }

      const transfers = json.data?.transfers ?? [];
      if (transfers.length === 0) break;

      let pastRange = false;
      for (const tx of transfers) {
        const txMs = tx.block_timestamp * 1000;
        if (txMs > endMs) continue;
        if (txMs < startMs) {
          pastRange = true;
          break;
        }

        allRecords.push({
          projectId,
          txHash: tx.hash,
          amount: tx.amount,
          withdrawnAt: new Date(txMs),
          blockNumber: tx.block_num,
          source: 'subscan',
          rawResponse: tx as unknown as object,
          fetchedAt: new Date(),
          periodKey,
        });
      }

      if (pastRange || transfers.length < row) break;
      page++;
    }

    if (page >= MAX_PAGES) {
      logger.warn({ projectId, periodKey, page }, 'subscan pagination hit MAX_PAGES limit');
    }

    return allRecords;
  }
}
