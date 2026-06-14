import { Request, Response } from 'express';
import { Client } from '../db/models.js';
import { clientManager } from '../services/clientManager.js';
import {
  fetchLatestRelease,
  hasUpdate,
  platformKey,
} from '../services/updateService.js';

/** 组装单个节点的更新状态。 */
async function buildStatus(client: Client) {
  const release = await fetchLatestRelease();
  const key = platformKey(client.os || '', client.arch || '');
  const downloadUrl = release?.assets[key] || null;
  const latest = release?.version || null;
  return {
    clientId: client.id,
    currentVersion: client.agentVersion || null,
    latestVersion: latest,
    platform: key,
    downloadUrl,
    // 有最新版本、版本落后、且该平台有匹配二进制时才算「可更新」。
    hasUpdate: !!latest && !!downloadUrl && hasUpdate(client.agentVersion, latest),
  };
}

/** GET /api/clients/:id/update —— 返回节点版本对比结果。 */
export async function getUpdateStatus(req: Request, res: Response) {
  const client = await Client.findByPk(req.params.id as string);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.json(await buildStatus(client));
}

/** POST /api/clients/:id/update —— 向在线 agent 下发更新指令。 */
export async function pushUpdate(req: Request, res: Response) {
  const client = await Client.findByPk(req.params.id as string);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const status = await buildStatus(client);
  if (!status.latestVersion || !status.downloadUrl) {
    res.status(404).json({ error: '未找到匹配当前平台的最新版本二进制' });
    return;
  }
  const sent = clientManager.pushUpdate(client.id, {
    version: status.latestVersion,
    downloadUrl: status.downloadUrl,
  });
  if (!sent) {
    res.status(503).json({ error: 'Agent is offline' });
    return;
  }
  res.json({ status: 'sent', version: status.latestVersion });
}

/** GET /api/updates/overview —— 列出所有节点的可更新状态。 */
export async function getUpdateOverview(_req: Request, res: Response) {
  const release = await fetchLatestRelease();
  const clients = await Client.findAll({ order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']] });
  const online = new Set(clientManager.getAllClients().map((c) => c.clientId));
  const result = clients.map((c) => {
    const key = platformKey(c.os || '', c.arch || '');
    const downloadUrl = release?.assets[key] || null;
    const latest = release?.version || null;
    return {
      clientId: c.id,
      name: c.name,
      currentVersion: c.agentVersion || null,
      latestVersion: latest,
      online: online.has(c.id),
      hasUpdate: !!latest && !!downloadUrl && hasUpdate(c.agentVersion, latest),
    };
  });
  res.json({ latestVersion: release?.version || null, clients: result });
}
