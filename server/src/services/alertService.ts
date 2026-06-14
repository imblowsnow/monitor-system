import { AlertRule, AlertEvent, Client, Metric, NotificationChannel } from '../db/models.js';
import { clientManager } from './clientManager.js';
import { notifyService } from './notifyService.js';
import { Op } from 'sequelize';

interface AlertState {
  ruleId: string;
  clientId: string;
  firstTriggered: number;
  fired: boolean;
}

class AlertService {
  private states = new Map<string, AlertState>();
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    this.timer = setInterval(() => this.check(), 10_000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async check() {
    const rules = await AlertRule.findAll({ where: { enabled: true } });

    for (const rule of rules) {
      const clients = await this.getTargetClients(rule);
      for (const client of clients) {
        await this.evaluateRule(rule, client);
      }
    }
  }

  private async evaluateRule(rule: AlertRule, client: Client) {
    const key = `${rule.id}:${client.id}`;
    const currentValue = await this.getCurrentValue(rule.metric, client.id);

    if (currentValue === null) return;

    // offline 是布尔状态(在线/离线),不依赖 operator/threshold——
    // 旧规则可能残留默认的 gt/90,若走通用比较会因 1 > 90 永不触发。
    const triggered = rule.metric === 'offline'
      ? currentValue === 1
      : this.checkCondition(currentValue, rule.operator, rule.threshold);

    if (triggered) {
      let state = this.states.get(key);
      if (!state) {
        state = { ruleId: rule.id, clientId: client.id, firstTriggered: Date.now(), fired: false };
        this.states.set(key, state);
      }

      const elapsed = (Date.now() - state.firstTriggered) / 1000;
      if (elapsed >= rule.durationSeconds && !state.fired) {
        state.fired = true;
        await this.fireAlert(rule, client, currentValue);
      }
    } else {
      const state = this.states.get(key);
      if (state?.fired) {
        await this.resolveAlert(rule, client);
      }
      this.states.delete(key);
    }
  }

  private checkCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  private async getCurrentValue(metric: string, clientId: string): Promise<number | null> {
    if (metric === 'offline') {
      const state = clientManager.getClientState(clientId);
      // 断连时 agent 会被移出连接表(getClientState 返回 undefined),
      // 这种情况同样算离线;只有确实在线(status==='online')才算 0。
      return (!state || state.status === 'offline') ? 1 : 0;
    }

    const latest = await Metric.findOne({
      where: { clientId },
      order: [['collectedAt', 'DESC']],
    });

    if (!latest || !latest.extra) return null;

    // 时效保护:只采信最近一段时间内的指标。节点掉线后不再上报,
    // 残留的旧记录(如最后一次 CPU 90%)否则会被反复判为超阈值而"一直触发"。
    const STALE_MS = 90_000;
    if (Date.now() - new Date(latest.collectedAt).getTime() > STALE_MS) return null;

    const m = latest.extra as {
      cpu?: { usage?: number };
      memory?: { used?: number; total?: number; usage?: number };
      disk?: Array<{ usage?: number; percent?: number }>;
    };

    switch (metric) {
      case 'cpu_usage': return m.cpu?.usage ?? null;
      case 'memory_usage':
        if (m.memory?.usage != null) return m.memory.usage;
        if (m.memory?.used && m.memory?.total) {
          return (m.memory.used / m.memory.total) * 100;
        }
        return null;
      case 'disk_usage':
        if (m.disk && m.disk.length > 0) {
          return Math.max(...m.disk.map(d => d.usage ?? d.percent ?? 0));
        }
        return null;
      default: return null;
    }
  }

  private async fireAlert(rule: AlertRule, client: Client, value: number) {
    await AlertEvent.create({
      ruleId: rule.id,
      clientId: client.id,
      currentValue: value,
      status: 'firing',
    });

    if (rule.notifyChannelIds && rule.notifyChannelIds.length > 0) {
      const channels = await NotificationChannel.findAll({
        where: { id: { [Op.in]: rule.notifyChannelIds }, enabled: true },
      });
      for (const channel of channels) {
        await notifyService.send(
          { type: channel.type, config: channel.config },
          {
            title: `[告警] ${rule.name}`,
            message: `节点 ${client.name} (${client.hostname}) 的 ${rule.metric} 当前值 ${value.toFixed(1)} ${rule.operator} ${rule.threshold}`,
          }
        );
      }
    }

    clientManager.broadcastToDashboards({
      type: 'alert_fired',
      payload: { ruleId: rule.id, clientId: client.id, value, ruleName: rule.name },
    });
  }

  private async resolveAlert(rule: AlertRule, client: Client) {
    await AlertEvent.update(
      { resolvedAt: new Date(), status: 'resolved' },
      { where: { ruleId: rule.id, clientId: client.id, status: 'firing' } }
    );

    clientManager.broadcastToDashboards({
      type: 'alert_resolved',
      payload: { ruleId: rule.id, clientId: client.id },
    });
  }

  private async getTargetClients(rule: AlertRule): Promise<Client[]> {
    if (rule.targetGroups && rule.targetGroups.length > 0) {
      return Client.findAll({ where: { groupName: { [Op.in]: rule.targetGroups } } });
    }
    return Client.findAll();
  }
}

export const alertService = new AlertService();
