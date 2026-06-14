import { Request, Response } from 'express';
import { getOrCreateConfig, updateConfigData } from '../services/clientConfigService.js';
import { getLatestCollectorData } from '../services/metricsService.js';
import { clientManager } from '../services/clientManager.js';

export async function getConfig(req: Request, res: Response) {
  const config = await getOrCreateConfig(req.params.id as string);
  res.json(config);
}

export async function updateConfig(req: Request, res: Response) {
  const clientId = req.params.id as string;
  const patch: Record<string, unknown> = {};
  if (req.body.reportInterval !== undefined) patch.reportInterval = Number(req.body.reportInterval);
  if (req.body.docker !== undefined) patch.docker = !!req.body.docker;

  const config = await updateConfigData(clientId, patch);
  clientManager.pushConfig(clientId, config);
  res.json(config);
}

export async function getCollectorData(req: Request, res: Response) {
  const limit = parseInt(req.query.limit as string) || 60;
  const data = await getLatestCollectorData(
    req.params.id as string,
    req.params.collector as string,
    limit,
  );
  res.json(data);
}
