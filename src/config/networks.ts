import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'smol-toml';
import { z } from 'zod';

// ── 타입 정의 ──────────────────────────────────────────────────────

export interface SubstrateNetworkConfig {
  projectId: string;
  fetchType: 'A';
  rpcUrl: string;
  walletAddress: string;
  decimals: number;
}

export interface RestNetworkConfig {
  projectId: string;
  fetchType: 'B';
  apiUrl: string;
  walletAddress: string;
  validatorAddress?: string;
}

export interface EvmNetworkConfig {
  projectId: string;
  fetchType: 'C';
  rpcUrl: string;
  walletAddress: string;
  contractAddress: string;
}

interface NetworksToml {
  avail: SubstrateNetworkConfig;
  stacks: RestNetworkConfig;
  story: RestNetworkConfig;
  hyperliquid: RestNetworkConfig;
  bera: EvmNetworkConfig;
  infrared: EvmNetworkConfig;
  monad: EvmNetworkConfig;
}

// ── Zod 스키마 (TOML 유효성 검사) ────────────────────────────────

const substrateSchema = z.object({
  projectId:     z.string().min(1),
  fetchType:     z.literal('A'),
  rpcUrl:        z.string(),
  walletAddress: z.string(),
  decimals:      z.number().int().positive(),
});

const restSchema = z.object({
  projectId:        z.string().min(1),
  fetchType:        z.literal('B'),
  apiUrl:           z.string(),
  walletAddress:    z.string(),
  validatorAddress: z.string().optional(),
});

const evmSchema = z.object({
  projectId:       z.string().min(1),
  fetchType:       z.literal('C'),
  rpcUrl:          z.string(),
  walletAddress:   z.string(),
  contractAddress: z.string(),
});

const networksSchema = z.object({
  avail:       substrateSchema,
  stacks:      restSchema,
  story:       restSchema,
  hyperliquid: restSchema,
  bera:        evmSchema,
  infrared:    evmSchema,
  monad:       evmSchema,
});

// ── TOML 로드 ─────────────────────────────────────────────────────

function loadNetworks(): NetworksToml {
  const tomlPath = join(__dirname, '../../config/networks.toml');
  const raw = readFileSync(tomlPath, 'utf-8');
  const result = networksSchema.safeParse(parse(raw));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`networks.toml validation failed:\n${issues}`);
  }
  return result.data;
}

const _networks = loadNetworks();

export const availConfig       = _networks.avail;
export const stacksConfig      = _networks.stacks;
export const storyConfig       = _networks.story;
export const hyperliquidConfig = _networks.hyperliquid;
export const beraConfig        = _networks.bera;
export const infraredConfig    = _networks.infrared;
export const monadConfig       = _networks.monad;
