import cron from 'node-cron';
import { Op } from 'sequelize';
import { sequelize } from '../db/index.js';
import { Metric } from '../db/models.js';

// 聚合任务独立运行，相关参数均写死、不走数据库配置：
// - 定时表达式：每天凌晨 3 点（独立于清理任务的凌晨 4 点）。
// - 聚合阈值：聚合「今天之前」的数据。
const AGGREGATE_CRON = '0 3 * * *';
const AGGREGATE_AFTER_DAYS = 1;

// 需要算 min/max/avg 的核心标量字段：[extra 内的对象 key, 该对象内的数值字段]
const AGG_FIELDS: Array<[string, string]> = [
  ['cpu', 'usage'],
  ['memory', 'usage'],
  ['network', 'rxSpeed'],
  ['network', 'txSpeed'],
];

export interface AggregateResult {
  /** 本次聚合新生成的聚合行数 */
  aggregatedRows: number;
  /** 本次聚合删除的原始行数 */
  deletedRows: number;
}

/**
 * 按小时聚合服务：把历史指标按小时压成一条，降低存储与查询压力。
 * 拥有自己的定时任务（凌晨 3 点），也供清理任务在删除前先行调用以保留精度。
 */
class AggregateService {
  private job: cron.ScheduledTask | null = null;

  start() {
    this.stop();
    // 固定每天凌晨 3 点，独立于清理任务，不受清理开关影响。
    this.job = cron.schedule(AGGREGATE_CRON, async () => {
      try {
        const r = await this.run();
        console.log(`[aggregate] 定时聚合完成：聚合生成 ${r.aggregatedRows} 条/删原始 ${r.deletedRows} 条`);
      } catch (e) {
        console.error('[aggregate] 定时聚合失败', e);
      }
    });
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
    }
  }

  /**
   * 执行一次按小时聚合：对 collectedAt 早于「今天 00:00 减 (afterDays-1) 天」的原始行，
   * 按 (clientId, 年-月-日-时) 分组，每组生成一条聚合行（核心标量存 avg + min/max，
   * 复杂结构取该小时最后一条快照），并删除该组原始行。跨库通用，不依赖窗口函数。
   * 已聚合行（extra._agg === true）跳过，避免重复聚合。afterDays 缺省用写死阈值。
   */
  async run(afterDays: number = AGGREGATE_AFTER_DAYS): Promise<AggregateResult> {
    const before = aggregateCutoff(afterDays);
    let aggregatedRows = 0;
    let deletedRows = 0;

    // 逐客户端处理，控制单次载入内存的行数。
    const clientIds = (await Metric.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('client_id')), 'clientId']],
      where: { collectedAt: { [Op.lt]: before } },
      raw: true,
    })) as unknown as Array<{ clientId: string }>;

    for (const { clientId } of clientIds) {
      const rows = await Metric.findAll({
        where: { clientId, collectedAt: { [Op.lt]: before } },
        order: [['collectedAt', 'ASC']],
      });

      // 按「年-月-日-时」分组（已聚合行跳过且不删）。
      const groups = new Map<string, Metric[]>();
      for (const row of rows) {
        const extra = row.extra as Record<string, unknown> | null;
        if (extra && extra._agg === true) continue;
        const key = hourKey(row.collectedAt);
        const arr = groups.get(key);
        if (arr) arr.push(row);
        else groups.set(key, [row]);
      }

      for (const [, groupRows] of groups) {
        // 单条原始行也聚合（统一形态），但仍删原始换聚合行，保证后续不再重复处理。
        const aggExtra = buildAggregateExtra(groupRows);
        const collectedAt = hourFloor(groupRows[0]!.collectedAt);
        const ids = groupRows.map(r => r.id);

        await sequelize.transaction(async (t) => {
          await Metric.create({ clientId, collectedAt, extra: aggExtra }, { transaction: t });
          // 按 id IN 分批删除，避免 IN 列表过大。
          for (let i = 0; i < ids.length; i += 500) {
            const batch = ids.slice(i, i + 500);
            deletedRows += await Metric.destroy({ where: { id: { [Op.in]: batch } }, transaction: t });
          }
        });
        aggregatedRows += 1;
      }
    }

    return { aggregatedRows, deletedRows };
  }
}

/** 聚合阈值：今天 00:00 减 (afterDays-1) 天。afterDays=1 即「今天之前」全部可聚合。 */
function aggregateCutoff(afterDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (afterDays - 1));
  return d;
}

/** 分组键：按本地年-月-日-时。 */
function hourKey(t: Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
}

/** 该小时整点时间，作为聚合行的 collectedAt，保证时间轴均匀。 */
function hourFloor(t: Date): Date {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d;
}

/**
 * 组装聚合行的 extra：以该小时最后一条原始行的 extra 为快照基底（保留 disk/netnodes/docker
 * 等复杂结构与 cores/total 等元信息），再覆盖核心标量字段为 avg 并附加 *Min/*Max。
 */
function buildAggregateExtra(rows: Metric[]): Record<string, unknown> {
  const last = (rows[rows.length - 1]!.extra as Record<string, unknown> | null) ?? {};
  // 深拷贝快照，避免改到原对象。
  const extra: Record<string, unknown> = JSON.parse(JSON.stringify(last));
  extra._agg = true;

  for (const [objKey, field] of AGG_FIELDS) {
    const values: number[] = [];
    for (const row of rows) {
      const obj = (row.extra as Record<string, unknown> | null)?.[objKey] as Record<string, unknown> | undefined;
      const v = obj?.[field];
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
    if (values.length === 0) continue;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    const target = (extra[objKey] && typeof extra[objKey] === 'object'
      ? extra[objKey]
      : (extra[objKey] = {})) as Record<string, unknown>;
    target[field] = round2(avg);
    target[`${field}Min`] = round2(min);
    target[`${field}Max`] = round2(max);
  }

  return extra;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const aggregateService = new AggregateService();
