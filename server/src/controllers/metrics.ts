import { Request, Response } from 'express';
import { getLatestMetrics, getMetricsRange } from '../services/metricsService.js';

export async function getMetrics(req: Request, res: Response) {
  const limit = parseInt(req.query.limit as string) || 60;
  const data = await getLatestMetrics(req.params.id as string, limit);
  res.json(data);
}

export async function getMetricsByRange(req: Request, res: Response) {
  const from = new Date(req.query.from as string);
  const to = new Date(req.query.to as string);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ error: 'Invalid date range' });
    return;
  }
  // bucket（秒）：>0 时服务端按桶聚合（7 天/一个月按小时），返回 avg+min/max；缺省返回原始点。
  const bucket = parseInt(req.query.bucket as string) || 0;
  const data = await getMetricsRange(req.params.id as string, from, to, bucket);
  res.json(data);
}
