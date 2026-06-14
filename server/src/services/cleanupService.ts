import cron from 'node-cron';
import { Op } from 'sequelize';
import { Metric, StatusLog, SystemConfig } from '../db/models.js';
import { aggregateService } from './aggregateService.js';

// 日志清理配置 key（存于 system_config 表）：
// - cleanup.enabled            是否启用定时清理（'true' / 'false'）
// - cleanup.cron               清理定时表达式，默认每天凌晨 4 点
// - cleanup.days               数据保留天数（指标与状态统一），0 表示不清理
// 注：按小时聚合已拆为独立的 aggregateService（固定凌晨 3 点），不在此配置。
export const CLEANUP_KEYS = [
  'cleanup.enabled',
  'cleanup.cron',
  'cleanup.days',
] as const;

const DEFAULT_CRON = '0 4 * * *';

interface CleanupConfig {
  enabled: boolean;
  cron: string;
  days: number;
}

export interface CleanupResult {
  metricDeleted: number;
  statusDeleted: number;
  days: number;
  /** 本次聚合新生成的聚合行数 */
  aggregatedRows: number;
  /** 本次聚合删除的原始行数 */
  aggregateDeleted: number;
}

class CleanupService {
  private job: cron.ScheduledTask | null = null;

  async start() {
    await this.reload();
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
    }
  }

  /** 读取最新配置并按需重建定时清理任务。配置变更后调用即可生效。 */
  async reload() {
    this.stop();
    const cfg = await this.loadConfig();
    if (!cfg.enabled) return;
    if (!cron.validate(cfg.cron)) {
      console.error(`Invalid cleanup cron expression: ${cfg.cron}`);
      return;
    }
    this.job = cron.schedule(cfg.cron, async () => {
      try {
        const r = await this.run();
        console.log(`[cleanup] 定时清理完成：聚合生成 ${r.aggregatedRows} 条/删原始 ${r.aggregateDeleted} 条，过期删除指标 ${r.metricDeleted} 条，状态 ${r.statusDeleted} 条`);
      } catch (e) {
        console.error('[cleanup] 定时清理失败', e);
      }
    });
  }

  /** 立即执行一次清理：先按小时聚合压缩，再按保留期删除过期数据。供手动触发与定时调用复用。 */
  async run(): Promise<CleanupResult> {
    const cfg = await this.loadConfig();

    // 1. 先聚合：把较早的数据每小时压成一条，删原始行（避免被下面的保留期删除前丢失精度）。
    const agg = await aggregateService.run();

    // 2. 再按保留期整段删除。
    let metricDeleted = 0;
    let statusDeleted = 0;
    if (cfg.days > 0) {
      const before = cutoff(cfg.days);
      metricDeleted = await Metric.destroy({ where: { collectedAt: { [Op.lt]: before } } });
      statusDeleted = await StatusLog.destroy({ where: { timestamp: { [Op.lt]: before } } });
    }

    return {
      metricDeleted,
      statusDeleted,
      days: cfg.days,
      aggregatedRows: agg.aggregatedRows,
      aggregateDeleted: agg.deletedRows,
    };
  }

  private async loadConfig(): Promise<CleanupConfig> {
    const rows = await SystemConfig.findAll({ where: { key: { [Op.in]: CLEANUP_KEYS as readonly string[] } } });
    const map: Record<string, string> = {};
    for (const r of rows) if (r.value != null) map[r.key] = r.value;
    return {
      enabled: map['cleanup.enabled'] === 'true',
      cron: map['cleanup.cron'] || DEFAULT_CRON,
      days: toNonNegInt(map['cleanup.days']),
    };
  }
}

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toNonNegInt(v: string | undefined): number {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const cleanupService = new CleanupService();
