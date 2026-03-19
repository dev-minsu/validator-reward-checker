import { ApiPromise, WsProvider } from '@polkadot/api';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { withRetry } from '@/utils/retry';
import { toHuman } from '@/utils/bignum';
import type { IFetcher, FetchResult } from '@/fetchers/base.fetcher';

export class AvailFetcher implements IFetcher {
  readonly projectName = 'avail';
  readonly fetchType = 'A' as const;

  async fetch(date: string): Promise<FetchResult> {
    try {
      return await withRetry(() => this._fetchOnce(date), {
        maxAttempts: 3,
        baseDelayMs: 1000,
      });
    } catch (error) {
      logger.error({ chain: 'avail', date, error }, 'fetch failed after retries');
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async _fetchOnce(date: string): Promise<FetchResult> {
    const provider = new WsProvider(env.AVAIL_RPC_URL);
    const api = await ApiPromise.create({ provider });

    try {
      const accountInfo = await api.query.system.account(env.AVAIL_WALLET_ADDRESS);
      const { data } = accountInfo as unknown as {
        data: {
          free: { toBigInt(): bigint; toString(): string };
          reserved: { toBigInt(): bigint; toString(): string };
        };
      };

      const planck = (data.free.toBigInt() + data.reserved.toBigInt()).toString();
      const balance = toHuman(planck, 18);

      logger.info({ chain: 'avail', date, balance }, 'snapshot fetched');

      return {
        ok: true,
        data: {
          projectId: 'avail',
          snapshotDate: date,
          balance: planck,
          fetchType: 'A',
          rawData: { free: data.free.toString(), reserved: data.reserved.toString() },
        },
      };
    } finally {
      await api.disconnect();
    }
  }
}
