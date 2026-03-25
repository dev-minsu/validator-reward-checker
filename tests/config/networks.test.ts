import { describe, it, expect } from 'vitest';
import {
  availConfig,
  stacksConfig,
  storyConfig,
  hyperliquidConfig,
  beraConfig,
  infraredConfig,
  monadConfig,
} from '@/config/networks';

describe('networks config (TOML)', () => {
  describe('availConfig (Type A — Substrate)', () => {
    it('projectId와 fetchType 정적 값 확인', () => {
      expect(availConfig.projectId).toBe('avail');
      expect(availConfig.fetchType).toBe('A');
    });

    it('decimals = 18', () => {
      expect(availConfig.decimals).toBe(18);
    });

    it('rpcUrl이 wss:// 또는 ws:// 로 시작', () => {
      expect(availConfig.rpcUrl).toMatch(/^wss?:\/\//);
    });
  });

  describe('stacksConfig (Type B — REST)', () => {
    it('projectId와 fetchType 정적 값 확인', () => {
      expect(stacksConfig.projectId).toBe('stacks');
      expect(stacksConfig.fetchType).toBe('B');
    });

    it('apiUrl이 https:// 로 시작', () => {
      expect(stacksConfig.apiUrl).toMatch(/^https?:\/\//);
    });
  });

  describe('storyConfig (Type B — REST with validatorAddress)', () => {
    it('projectId와 fetchType 정적 값 확인', () => {
      expect(storyConfig.projectId).toBe('story');
      expect(storyConfig.fetchType).toBe('B');
    });

    it('validatorAddress 필드 존재 (string)', () => {
      expect(typeof storyConfig.validatorAddress).toBe('string');
    });
  });

  describe('hyperliquidConfig (Type B — REST)', () => {
    it('projectId와 fetchType 정적 값 확인', () => {
      expect(hyperliquidConfig.projectId).toBe('hyperliquid');
      expect(hyperliquidConfig.fetchType).toBe('B');
    });
  });

  describe('beraConfig (Type C — EVM)', () => {
    it('projectId와 fetchType 정적 값 확인', () => {
      expect(beraConfig.projectId).toBe('bera');
      expect(beraConfig.fetchType).toBe('C');
    });

    it('contractAddress 필드 존재 (string)', () => {
      expect(typeof beraConfig.contractAddress).toBe('string');
    });
  });

  describe('infraredConfig (Type C — EVM)', () => {
    it('projectId와 fetchType 정적 값 확인', () => {
      expect(infraredConfig.projectId).toBe('infrared');
      expect(infraredConfig.fetchType).toBe('C');
    });
  });

  describe('monadConfig (Type C — EVM)', () => {
    it('projectId와 fetchType 정적 값 확인', () => {
      expect(monadConfig.projectId).toBe('monad');
      expect(monadConfig.fetchType).toBe('C');
    });

    it('rpcUrl이 testnet endpoint 포함', () => {
      expect(monadConfig.rpcUrl).toContain('monad');
    });
  });
});
