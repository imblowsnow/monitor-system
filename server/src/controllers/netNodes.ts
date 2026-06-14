import { Request, Response } from 'express';
import { NetNode } from '../db/models.js';
import { clientManager } from '../services/clientManager.js';
import { getOrCreateConfig } from '../services/clientConfigService.js';

/** 节点表变更后，因为它影响所有 client 的下发列表，向所有在线 agent 重新推送配置。 */
async function repushAll() {
  await clientManager.pushConfigToAll((clientId) => getOrCreateConfig(clientId));
}

export async function listNetNodes(_req: Request, res: Response) {
  const nodes = await NetNode.findAll({ order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] });
  res.json(nodes);
}

export async function createNetNode(req: Request, res: Response) {
  const { name, target, probe, isp, enabled, sortOrder } = req.body;
  if (!name || !target) {
    res.status(400).json({ error: 'name and target are required' });
    return;
  }
  const node = await NetNode.create({
    name,
    target,
    probe: probe || 'http',
    isp: isp ?? null,
    enabled: enabled !== false,
    sortOrder: Number(sortOrder) || 0,
  });
  await repushAll();
  res.status(201).json(node);
}

export async function updateNetNode(req: Request, res: Response) {
  const node = await NetNode.findByPk(req.params.id as string);
  if (!node) {
    res.status(404).json({ error: 'NetNode not found' });
    return;
  }
  await node.update(req.body);
  await repushAll();
  res.json(node);
}

export async function deleteNetNode(req: Request, res: Response) {
  const node = await NetNode.findByPk(req.params.id as string);
  if (!node) {
    res.status(404).json({ error: 'NetNode not found' });
    return;
  }
  await node.destroy();
  await repushAll();
  res.json({ success: true });
}
