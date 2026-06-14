import { WebSocket } from 'ws';
import { ClientStatus } from '@monitor/shared';
import { StatusLog } from '../db/models.js';

interface ClientConnection {
  ws: WebSocket;
  clientId: string;
  dbId: string;
  status: ClientStatus;
  lastHeartbeat: number;
  meta: {
    hostname: string;
    os: string;
    arch: string;
    version: string;
    ipAddress: string;
  };
}

interface DashboardConnection {
  ws: WebSocket;
  userId: string;
}

class ClientManager {
  private clients = new Map<string, ClientConnection>();
  private dashboards = new Map<string, DashboardConnection>();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  start() {
    this.healthCheckTimer = setInterval(() => this.checkHealth(), 5000);
  }

  stop() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  registerAgent(clientId: string, dbId: string, ws: WebSocket, meta: ClientConnection['meta']) {
    this.clients.set(clientId, {
      ws,
      clientId,
      dbId,
      status: 'online',
      lastHeartbeat: Date.now(),
      meta,
    });
    this.logStatusChange(clientId, 'online');
    this.broadcastToDashboards({
      type: 'client_status',
      payload: { clientId, status: 'online', meta },
    });
  }

  unregisterAgent(clientId: string) {
    this.clients.delete(clientId);
    this.logStatusChange(clientId, 'offline');
    this.broadcastToDashboards({
      type: 'client_status',
      payload: { clientId, status: 'offline' },
    });
  }

  registerDashboard(id: string, ws: WebSocket, userId: string) {
    this.dashboards.set(id, { ws, userId });
  }

  unregisterDashboard(id: string) {
    this.dashboards.delete(id);
  }

  updateHeartbeat(clientId: string) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = Date.now();
      if (client.status !== 'online') {
        client.status = 'online';
        this.broadcastToDashboards({
          type: 'client_status',
          payload: { clientId, status: 'online' },
        });
      }
    }
  }

  getAgentWs(clientId: string): WebSocket | undefined {
    return this.clients.get(clientId)?.ws;
  }

  getClientState(clientId: string): ClientConnection | undefined {
    return this.clients.get(clientId);
  }

  getAllClients(): Array<{ clientId: string; status: ClientStatus; meta: ClientConnection['meta'] }> {
    return Array.from(this.clients.values()).map(c => ({
      clientId: c.clientId,
      status: c.status,
      meta: c.meta,
    }));
  }

  broadcastToDashboards(message: unknown) {
    const data = JSON.stringify(message);
    for (const { ws } of this.dashboards.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  broadcastMetrics(clientId: string, metrics: unknown) {
    this.broadcastToDashboards({
      type: 'metrics_update',
      payload: { clientId, metrics },
    });
  }

  /** 向指定在线 agent 推送配置（热更新）。 */
  pushConfig(clientId: string, config: unknown) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'config_update',
        timestamp: Date.now(),
        payload: { config },
      }));
    }
  }

  /** 向指定在线 agent 下发自更新指令。离线返回 false。 */
  pushUpdate(clientId: string, payload: { version: string; downloadUrl: string; checksum?: string }): boolean {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'agent_update',
        timestamp: Date.now(),
        payload,
      }));
      return true;
    }
    return false;
  }

  /** 向所有在线 agent 重新组装并推送配置（节点表变更时用）。 */
  async pushConfigToAll(buildConfig: (clientId: string) => Promise<unknown>) {
    for (const client of this.clients.values()) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      const config = await buildConfig(client.clientId);
      client.ws.send(JSON.stringify({
        type: 'config_update',
        timestamp: Date.now(),
        payload: { config },
      }));
    }
  }

  private logStatusChange(clientId: string, status: string) {
    StatusLog.create({ clientId, status, timestamp: new Date() }).catch(() => {});
  }

  private checkHealth() {
    const now = Date.now();
    for (const [id, client] of this.clients) {
      const elapsed = now - client.lastHeartbeat;
      if (elapsed > 30_000) {
        if (client.status !== 'offline') {
          client.status = 'offline';
          this.logStatusChange(id, 'offline');
          this.broadcastToDashboards({
            type: 'client_status',
            payload: { clientId: id, status: 'offline' },
          });
        }
      } else if (elapsed > 15_000) {
        if (client.status !== 'warning') {
          client.status = 'warning';
          this.logStatusChange(id, 'warning');
          this.broadcastToDashboards({
            type: 'client_status',
            payload: { clientId: id, status: 'warning' },
          });
        }
      }
    }
  }
}

export const clientManager = new ClientManager();
