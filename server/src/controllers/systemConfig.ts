import { Request, Response } from 'express';
import { SystemConfig } from '../db/models.js';
import { cleanupService, CLEANUP_KEYS } from '../services/cleanupService.js';
import { aggregateService } from '../services/aggregateService.js';

// 可在后台读写的系统配置白名单：仅这些 key 允许通过接口修改，避免任意键写入。
const ALLOWED_KEYS = [
  'geo.api.url',
  'geo.field.country',
  'geo.field.countryName',
  ...CLEANUP_KEYS,
] as const;

/** 获取全部系统配置（key -> value 映射）。 */
export async function getSystemConfig(_req: Request, res: Response) {
  const rows = await SystemConfig.findAll();
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.value != null) map[r.key] = r.value;
  }
  res.json(map);
}

/** 批量更新系统配置；body 为 { key: value } 映射，仅白名单内的 key 生效。 */
export async function updateSystemConfig(req: Request, res: Response) {
  const body = (req.body || {}) as Record<string, unknown>;
  const entries = Object.entries(body).filter(([k]) => (ALLOWED_KEYS as readonly string[]).includes(k));
  await Promise.all(
    entries.map(([key, value]) =>
      SystemConfig.upsert({ key, value: value == null ? '' : String(value) })
    )
  );
  // 若改动了清理相关配置，重建定时任务使其立即生效。
  if (entries.some(([k]) => (CLEANUP_KEYS as readonly string[]).includes(k))) {
    await cleanupService.reload();
  }
  res.json({ success: true });
}

/** 手动触发一次日志清理，返回各类删除条数。 */
export async function runCleanup(_req: Request, res: Response) {
  const result = await cleanupService.run();
  res.json(result);
}

/** 仅手动触发一次按小时聚合（不做保留期删除），用于测试聚合效果。 */
export async function runAggregate(_req: Request, res: Response) {
  const result = await aggregateService.run();
  res.json(result);
}
