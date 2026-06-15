import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { randomBytes } from 'crypto';
import { Client, StatusLog } from '../db/models.js';
import { clientManager } from '../services/clientManager.js';

/** 节点无实时连接时,据是否有历史状态记录判定 offline(有记录)或 empty(从未上报)。 */
async function resolveStatus(clientId: string, liveStatus?: string): Promise<string> {
  if (liveStatus) return liveStatus;
  const hasLog = await StatusLog.findOne({ where: { clientId }, attributes: ['id'] });
  return hasLog ? 'offline' : 'empty';
}

export async function getClients(req: Request, res: Response) {
  const dbClients = await Client.findAll({ order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']] });
  const onlineStates = clientManager.getAllClients();
  const result = await Promise.all(dbClients.map(async (c) => {
    const state = onlineStates.find(s => s.clientId === c.id);
    return { ...c.toJSON(), status: await resolveStatus(c.id, state?.status) };
  }));
  res.json(result);
}

/** 批量更新节点排序：body.order 为按目标顺序排列的 client id 数组。 */
export async function reorderClients(req: Request, res: Response) {
  const order: string[] = Array.isArray(req.body.order) ? req.body.order : [];
  await Promise.all(
    order.map((id, idx) => Client.update({ sortOrder: idx }, { where: { id } }))
  );
  res.json({ success: true });
}

export async function getClient(req: Request, res: Response) {
  const client = await Client.findByPk(req.params.id as string);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const state = clientManager.getClientState(client.id);
  res.json({ ...client.toJSON(), status: await resolveStatus(client.id, state?.status) });
}

export async function createClient(req: Request, res: Response) {
  const { name, groupName, tags } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  // token 由后台自动生成，不由前端传入
  const token = randomBytes(32).toString('hex');
  const client = await Client.create({
    name,
    groupName: groupName || 'default',
    token,
    tags: Array.isArray(tags) ? tags : [],
  });
  res.status(201).json(client);
}

export async function updateClient(req: Request, res: Response) {
  const client = await Client.findByPk(req.params.id as string);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  await client.update(req.body);
  res.json(client);
}

export async function deleteClient(req: Request, res: Response) {
  const client = await Client.findByPk(req.params.id as string);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  await client.destroy();
  res.json({ success: true });
}

export async function getGroups(_req: Request, res: Response) {
  const groups = await Client.findAll({
    attributes: ['groupName'],
    group: ['groupName'],
  });
  res.json(groups.map(g => g.groupName));
}

/** 统计一段状态时间线的可用率(online 时长占比,%)。无任何真实数据时返回 null。 */
function calcUptimePercent(timeline: Array<{ status: string; start: string; end: string }>): number | null {
  let online = 0;
  let total = 0;
  for (const seg of timeline) {
    if (seg.status === 'empty') continue; // 无数据段不参与可用率计算
    const dur = new Date(seg.end).getTime() - new Date(seg.start).getTime();
    total += dur;
    if (seg.status === 'online') online += dur;
  }
  if (!total) return null;
  return Math.round((online / total) * 1000) / 10;
}

/** 构建某 client 在过去 hours 小时内的状态时间线(与 getUptimeTimeline 同一算法)。 */
async function buildTimeline(clientId: string, hours: number) {
  const since = new Date(Date.now() - hours * 3600_000);
  const logs = await StatusLog.findAll({
    where: { clientId, timestamp: { [Op.gte]: since } },
    order: [['timestamp', 'ASC']],
  });
  const lastBefore = await StatusLog.findOne({
    where: { clientId, timestamp: { [Op.lt]: since } },
    order: [['timestamp', 'DESC']],
  });

  const timeline: Array<{ status: string; start: string; end: string }> = [];
  const startTime = since.toISOString();
  const endTime = new Date().toISOString();
  // 是否存在任何真实状态记录:窗口内有日志,或窗口前有过日志。
  // 二者皆无 = 该节点从未上报过,属于「无数据」,不能当成离线(红色)。
  const hasData = logs.length > 0 || !!lastBefore;
  // 首段(窗口开始 → 第一条日志)只有在窗口之前确实有记录时才沿用其状态;
  // 否则该时段节点尚未上报过,属于「无数据」(灰),不能当成离线(红)。
  const initialStatus = lastBefore?.status ?? 'empty';

  if (logs.length === 0) {
    timeline.push({ status: initialStatus, start: startTime, end: endTime });
  } else {
    timeline.push({ status: initialStatus, start: startTime, end: (logs[0].timestamp as Date).toISOString() });
    for (let i = 0; i < logs.length; i++) {
      const end = i + 1 < logs.length ? (logs[i + 1].timestamp as Date).toISOString() : endTime;
      timeline.push({ status: logs[i].status, start: (logs[i].timestamp as Date).toISOString(), end });
    }
  }
  return { since: startTime, until: endTime, timeline, hasData };
}

/**
 * 公开服务器列表(免登)。
 * 只暴露非敏感字段:id(供详情页跳转)、名称、分组、状态、24h 可用率与时间线。
 * 不含 IP / 主机名 / 指标等内网信息。
 */
export async function getPublicStatus(req: Request, res: Response) {
  const hours = Math.min(Number(req.query.hours) || 24, 24 * 90);
  const dbClients = await Client.findAll({
    attributes: ['id', 'name', 'groupName', 'country', 'countryName', 'sortOrder', 'createdAt'],
    order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']],
  });
  const onlineStates = clientManager.getAllClients();

  const result = await Promise.all(dbClients.map(async (c) => {
    const state = onlineStates.find(s => s.clientId === c.id);
    const { timeline, hasData } = await buildTimeline(c.id, hours);
    // 实时无连接且历史无记录 = 从未上报,标记为 empty(无数据),前台显示灰色。
    const status = state?.status || (hasData ? 'offline' : 'empty');
    return {
      id: c.id,
      name: c.name,
      group: c.groupName,
      country: c.country,
      countryName: c.countryName,
      status,
      uptime: calcUptimePercent(timeline),
      timeline,
    };
  }));
  res.json(result);
}

/**
 * 公开单服务器详情(免登)。
 * 返回名称、分组、当前状态,及指定时长(默认 24h,最长 90 天)的状态时间线与各时段可用率。
 */
export async function getPublicClientStatus(req: Request, res: Response) {
  const client = await Client.findByPk(req.params.id as string, {
    attributes: ['id', 'name', 'groupName', 'createdAt'],
  });
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const hours = Math.min(Number(req.query.hours) || 24, 24 * 90);
  const state = clientManager.getClientState(client.id);
  const { since, until, timeline, hasData } = await buildTimeline(client.id, hours);

  // 额外给出 24h / 7d / 30d 三档可用率,供详情页概览展示。
  const [d1, d7, d30] = await Promise.all([
    buildTimeline(client.id, 24),
    buildTimeline(client.id, 24 * 7),
    buildTimeline(client.id, 24 * 30),
  ]);

  res.json({
    id: client.id,
    name: client.name,
    group: client.groupName,
    status: state?.status || (hasData ? 'offline' : 'empty'),
    since,
    until,
    timeline,
    uptime: {
      day: calcUptimePercent(d1.timeline),
      week: calcUptimePercent(d7.timeline),
      month: calcUptimePercent(d30.timeline),
    },
  });
}

export async function getUptimeTimeline(req: Request, res: Response) {
  const clientId = req.params.id as string;
  const hours = Math.min(Number(req.query.hours) || 24, 24 * 90);
  const since = new Date(Date.now() - hours * 3600_000);

  const logs = await StatusLog.findAll({
    where: { clientId, timestamp: { [Op.gte]: since } },
    order: [['timestamp', 'ASC']],
  });

  const lastBefore = await StatusLog.findOne({
    where: { clientId, timestamp: { [Op.lt]: since } },
    order: [['timestamp', 'DESC']],
  });

  const timeline: Array<{ status: string; start: string; end: string }> = [];
  const startTime = since.toISOString();
  const endTime = new Date().toISOString();

  const initialStatus = lastBefore?.status ?? 'empty';

  if (logs.length === 0) {
    timeline.push({ status: initialStatus, start: startTime, end: endTime });
  } else {
    timeline.push({ status: initialStatus, start: startTime, end: (logs[0].timestamp as Date).toISOString() });
    for (let i = 0; i < logs.length; i++) {
      const end = i + 1 < logs.length ? (logs[i + 1].timestamp as Date).toISOString() : endTime;
      timeline.push({ status: logs[i].status, start: (logs[i].timestamp as Date).toISOString(), end });
    }
  }

  res.json({ clientId, since: startTime, until: endTime, timeline });
}
