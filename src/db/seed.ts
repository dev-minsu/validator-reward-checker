import { Db } from 'mongodb';
import { getDb, closeDb } from './client';
import { logger } from '@/utils/logger';

interface BalanceSnapshotSeed {
  projectId:    string;
  snapshotDate: string;
  balance:      string;
  rewardAmount: string | null;
  fetchType:    'A' | 'B' | 'C';
  updatedAt:    Date;
}

interface ValidatorProject {
  name: string;
  chain: string;
  tokenSymbol: string;
  fetchType: 'A' | 'B' | 'C';
  walletAddress: string;
  startDate: string;
  isActive: boolean;
  createdAt: Date;
}

const SEED_PROJECTS: Omit<ValidatorProject, 'createdAt'>[] = [
  { name: 'Avail Validator',          chain: 'avail',       tokenSymbol: 'AVAIL', fetchType: 'A', walletAddress: '', startDate: '2025-01-20', isActive: true },
  { name: 'Stacks Signer',            chain: 'stacks',      tokenSymbol: 'BTC',   fetchType: 'B', walletAddress: '', startDate: '2024-04-29', isActive: true },
  { name: 'Story Validator',          chain: 'story',       tokenSymbol: 'IP',    fetchType: 'B', walletAddress: '', startDate: '2025-03-05', isActive: true },
  { name: 'Bera Validator',           chain: 'bera',        tokenSymbol: 'BGT',   fetchType: 'C', walletAddress: '', startDate: '2025-02-06', isActive: true },
  { name: 'Infrared Bera Validator',  chain: 'infrared',    tokenSymbol: 'iBERA', fetchType: 'C', walletAddress: '', startDate: '2025-04-21', isActive: true },
  { name: 'Hyperliquid',              chain: 'hyperliquid', tokenSymbol: 'HYPE',  fetchType: 'B', walletAddress: '', startDate: '2025-04-22', isActive: true },
  { name: 'Monad',                    chain: 'monad',       tokenSymbol: 'MON',   fetchType: 'C', walletAddress: '', startDate: '2025-11-13', isActive: true },
];

async function createIndexes(db: Db): Promise<void> {
  await db.collection('balance_snapshots').createIndex(
    { projectId: 1, snapshotDate: 1 },
    { unique: true, name: 'projectId_snapshotDate_unique' }
  );

  await db.collection('token_transfer_snapshots').createIndex(
    { projectId: 1, snapshotDate: 1, tokenSymbol: 1 },
    { unique: true, name: 'projectId_snapshotDate_tokenSymbol_unique' }
  );

  // balance_history: 주기적 잔고 수집 (TTL 90일)
  await db.collection('balance_history').createIndex(
    { projectId: 1, snapshotAt: 1 },
    { unique: true, name: 'projectId_snapshotAt_unique' },
  );
  await db.collection('balance_history').createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 7776000, name: 'createdAt_ttl_90d' }, // 90일
  );

  // reward_reports: 월단위 리포트 결과
  await db.collection('reward_reports').createIndex(
    { projectId: 1, periodStart: 1 },
    { unique: true, name: 'projectId_periodStart_unique' },
  );

  // indexer_query_cache: 조회 완료 기간 마커 (빈 결과 포함)
  await db.collection('indexer_query_cache').createIndex(
    { projectId: 1, periodKey: 1 },
    { unique: true, name: 'projectId_periodKey_unique' },
  );

  // withdrawal_records: 인덱서 조회 결과 캐시 (업데이트)
  await db.collection('withdrawal_records').createIndex(
    { projectId: 1, txHash: 1 },
    { unique: true, name: 'projectId_txHash_unique' },
  );
  await db.collection('withdrawal_records').createIndex(
    { projectId: 1, periodKey: 1 },
    { name: 'projectId_periodKey' },
  );
}

async function seedValidatorProjects(db: Db): Promise<void> {
  const col = db.collection('validator_projects');

  for (const project of SEED_PROJECTS) {
    const doc: ValidatorProject = { ...project, createdAt: new Date() };
    await col.updateOne(
      { chain: project.chain },
      { $setOnInsert: doc },
      { upsert: true }
    );
  }
}

async function seedBalanceSnapshot(db: Db): Promise<void> {
  const doc: BalanceSnapshotSeed = {
    projectId:    'avail',
    snapshotDate: '2026-02-26',
    balance:      '648173780900000000000000',
    rewardAmount: null,
    fetchType:    'A',
    updatedAt:    new Date(),
  };
  await db.collection('balance_snapshots').replaceOne(
    { projectId: doc.projectId, snapshotDate: doc.snapshotDate },
    doc,
    { upsert: true },
  );
}

async function main(): Promise<void> {
  const db = await getDb();

  logger.info('creating indexes');
  await createIndexes(db);
  logger.info('indexes created');

  logger.info('seeding validator_projects');
  await seedValidatorProjects(db);
  logger.info('seed complete: 7 projects upserted');

  logger.info('seeding historical balance snapshot (avail 2026-02-26)');
  await seedBalanceSnapshot(db);
  logger.info('historical snapshot seeded');

  await closeDb();
}

main().catch((err: unknown) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
