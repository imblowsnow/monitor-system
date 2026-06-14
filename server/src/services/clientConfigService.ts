import { NetNode, ClientConfig as ClientConfigModel } from '../db/models.js';
import type { ClientConfig, NetNode as NetNodeDTO } from '@monitor/shared';

const DEFAULT_DATA = {
  reportInterval: 5,
  docker: true,
};

const SEED_NODES = [
  { name: '中国电信', target: 'gd-ct-dualstack.ip.zstaticcdn.com', probe: 'http', isp: 'CT', sortOrder: 1 },
  { name: '中国联通', target: 'gd-cu-dualstack.ip.zstaticcdn.com', probe: 'http', isp: 'CU', sortOrder: 2 },
  { name: '中国移动', target: 'gd-cm-dualstack.ip.zstaticcdn.com', probe: 'http', isp: 'CM', sortOrder: 3 },
  { name: 'BD', target: 'lf3-ips.zstaticcdn.com', probe: 'http', isp: 'BD', sortOrder: 4 },
];

/** 首次启动若节点表为空则插入默认节点。 */
export async function seedNetNodes() {
  const count = await NetNode.count();
  if (count === 0) {
    await NetNode.bulkCreate(SEED_NODES);
  }
}

async function getEnabledNetNodes(): Promise<NetNodeDTO[]> {
  const rows = await NetNode.findAll({
    where: { enabled: true },
    order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']],
  });
  return rows.map(n => ({
    name: n.name,
    target: n.target,
    probe: n.probe as NetNodeDTO['probe'],
    isp: n.isp ?? undefined,
  }));
}

/** 组装下发给指定 client 的完整配置：data 展开 + 全局启用节点。 */
export async function getOrCreateConfig(clientId: string): Promise<ClientConfig> {
  const [row] = await ClientConfigModel.findOrCreate({
    where: { clientId },
    defaults: { clientId, data: DEFAULT_DATA },
  });
  const data = { ...DEFAULT_DATA, ...(row.data || {}) };
  const netnodes = await getEnabledNetNodes();
  return {
    reportInterval: Number(data.reportInterval) || DEFAULT_DATA.reportInterval,
    docker: data.docker !== false,
    netnodes,
  };
}

/** 更新 client 配置的 data 字段（合并），返回组装后的完整配置。 */
export async function updateConfigData(clientId: string, patch: Record<string, unknown>): Promise<ClientConfig> {
  const [row] = await ClientConfigModel.findOrCreate({
    where: { clientId },
    defaults: { clientId, data: DEFAULT_DATA },
  });
  await row.update({ data: { ...DEFAULT_DATA, ...(row.data || {}), ...patch } });
  return getOrCreateConfig(clientId);
}
