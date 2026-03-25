import { logger } from '@/utils/logger';
import { requireEnv } from '@/config/env';
import { toHuman } from '@/utils/bignum';
import { utcToKstDateStr } from '@/utils/date';
import type { RewardReport } from './report.service';

export class SlackService {
  async sendReport(report: RewardReport, tokenSymbol: string, decimals: number): Promise<void> {
    const webhookUrl = requireEnv('SLACK_WEBHOOK_URL');
    const startKst = utcToKstDateStr(report.periodStart);
    const endKst = utcToKstDateStr(report.periodEnd);

    const text = [
      `📊 Validator Reward Report — ${startKst} ~ ${endKst}`,
      `──────────────────────────────────────────────────────`,
      `${report.projectId.toUpperCase()}   기간 리워드: +${toHuman(report.rewardAmount, decimals)} ${tokenSymbol}`,
      `        시작 잔고:   ${toHuman(report.balanceStart, decimals)} ${tokenSymbol} (${startKst} 00:00 KST)`,
      `        종료 잔고:   ${toHuman(report.balanceEnd, decimals)} ${tokenSymbol} (${endKst} 23:59 KST)`,
      `        인출 보정:   +${toHuman(report.totalWithdrawals, decimals)} ${tokenSymbol}`,
      `──────────────────────────────────────────────────────`,
      `✅ 리포트 생성 완료`,
    ].join('\n');

    await this._post(webhookUrl, { text });
    logger.info({ projectId: report.projectId }, 'slack report sent');
  }

  async sendError(chain: string, error: string): Promise<void> {
    const webhookUrl = requireEnv('SLACK_WEBHOOK_URL');
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const text = `❌ [${chain}] 잔고 수집 실패 — ${timestamp}\n${error}`;
    await this._post(webhookUrl, { text });
    logger.warn({ chain }, 'slack error notification sent');
  }

  private async _post(url: string, payload: { text: string }): Promise<void> {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error(`Slack webhook failed: ${resp.status} ${resp.statusText}`);
    }
  }
}
