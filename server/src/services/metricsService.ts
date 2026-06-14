import { Metric } from '../db/models.js';
import { MetricsPayload } from '@monitor/shared';
import { Op } from 'sequelize';

export async function saveMetrics(dbClientId: string, data: MetricsPayload) {
  // 所有指标（系统指标 + 扩展采集器）统一作为 JSON 存进 extra 一行。
  await Metric.create({
    clientId: dbClientId,
    collectedAt: new Date(),
    extra: data as unknown as Record<string, unknown>,
  });
}

/**
 * 旧版 agent 兼容：将单个采集器结果以采集器名为 key 平铺进 extra 一行存储，
 * 与新版 metrics_report 平铺的形态保持一致。
 */
export async function saveCollectorData(dbClientId: string, collector: string, data: unknown) {
  await Metric.create({
    clientId: dbClientId,
    collectedAt: new Date(),
    extra: { [collector]: data },
  });
}

/** 把存储行摊平为 { id, clientId, collectedAt, ...extra }，与实时 WS 上报的 payload 形态一致。 */
function flatten(row: Metric) {
  const { extra, ...rest } = row.toJSON() as Record<string, unknown>;
  return { ...rest, ...((extra as Record<string, unknown> | null) ?? {}) };
}

export async function getLatestMetrics(dbClientId: string, limit = 60) {
  const rows = await Metric.findAll({
    where: { clientId: dbClientId },
    order: [['collectedAt', 'DESC']],
    limit,
  });
  return rows.map(flatten);
}

export async function getMetricsRange(
  dbClientId: string,
  from: Date,
  to: Date,
  bucketSeconds = 0,
) {
  const rows = await Metric.findAll({
    where: {
      clientId: dbClientId,
      collectedAt: { [Op.between]: [from, to] },
    },
    order: [['collectedAt', 'ASC']],
  });
  const flat = rows.map(flatten);
  // bucketSeconds=0 表示返回原始点（实时/今天）；否则按桶聚合（7 天/一个月按小时），
  // 每桶产出 avg + min/max，前端 bandSeries 据此画波动带。
  if (bucketSeconds <= 0) return flat;
  return aggregateByBucket(flat, bucketSeconds * 1000);
}

function num(v: unknown): number | null {
  return typeof v === 'number' && !isNaN(v) ? v : null;
}

/** 把一段原始指标按时间桶聚合，每桶取 avg/min/max（cpu/内存/网络），其余字段取桶内最后一条快照。 */
function aggregateByBucket(rows: Array<Record<string, any>>, bucketMs: number) {
  const buckets = new Map<number, Array<Record<string, any>>>();
  for (const r of rows) {
    const t = new Date(r.collectedAt).getTime();
    const key = Math.floor(t / bucketMs) * bucketMs;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(r);
  }
  const out: Array<Record<string, any>> = [];
  for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
    const group = buckets.get(key)!;
    const last = group[group.length - 1];

    const agg = (get: (m: any) => number | null) => {
      const vals = group.map(get).filter((v): v is number => v != null);
      if (!vals.length) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      return { avg: sum / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
    };

    const cpu = agg(m => num(m.cpu?.usage) ?? num(m.cpuUsage));
    const mem = agg(m => {
      if (num(m.memoryUsed) != null && num(m.memoryTotal)) return (m.memoryUsed / m.memoryTotal) * 100;
      return num(m.memory?.usage);
    });
    const rx = agg(m => num(m.network?.rxSpeed));
    const tx = agg(m => num(m.network?.txSpeed));
    const proc = agg(m => num(m.processes));

    out.push({
      ...last, // 继承最后一条快照：disk / docker / netnodes / 其余原样
      collectedAt: new Date(key + bucketMs / 2).toISOString(),
      cpu: { ...(last.cpu || {}), usage: cpu?.avg ?? 0, usageMin: cpu?.min ?? null, usageMax: cpu?.max ?? null },
      memory: { ...(last.memory || {}), usage: mem?.avg ?? 0, usageMin: mem?.min ?? null, usageMax: mem?.max ?? null },
      network: {
        ...(last.network || {}),
        rxSpeed: rx?.avg ?? 0, rxSpeedMin: rx?.min ?? null, rxSpeedMax: rx?.max ?? null,
        txSpeed: tx?.avg ?? 0, txSpeedMin: tx?.min ?? null, txSpeedMax: tx?.max ?? null,
      },
      processes: proc ? Math.round(proc.avg) : last.processes,
    });
  }
  return out;
}

export async function getLatestCollectorData(dbClientId: string, collector: string, limit = 60) {
  // extra 现为跨库通用 JSON 列，JSON 内路径过滤在 PG/MySQL/SQLite 语法各异，
  // 故查近期记录后在应用层过滤。采集器结果以采集器名为 key 平铺存于 extra[collector]。
  const rows = await Metric.findAll({
    where: { clientId: dbClientId },
    order: [['collectedAt', 'DESC']],
    limit: limit * 4,
  });
  return rows
    .map(r => {
      const data = (r.extra as Record<string, unknown> | null)?.[collector];
      if (data == null) return null;
      return { collectedAt: r.collectedAt, data };
    })
    .filter((r): r is { collectedAt: Date; data: {} } => r !== null)
    .slice(0, limit);
}
