import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { MessageType, type WSMessage, type AuthPayload, type MetricsPayload, type CommandResultPayload, type TerminalDataPayload, type TerminalClosePayload, type CollectorReportPayload } from '@monitor/shared';
import { config } from '../config/index.js';
import { clientManager } from '../services/clientManager.js';
import { terminalService } from '../services/terminalService.js';
import { saveMetrics, saveCollectorData } from '../services/metricsService.js';
import { getOrCreateConfig } from '../services/clientConfigService.js';
import { resolveCountry } from '../services/geoService.js';
import { updateCommandResult } from '../services/commandService.js';
import { Client } from '../db/models.js';
import jwt from 'jsonwebtoken';

export function createAgentWss(server: any): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let authenticated = false;
    let clientId = '';
    let dbId = '';

    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'auth_timeout');
      }
    }, 10_000);

    ws.on('message', async (raw: Buffer) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: MessageType.ERROR, payload: { code: 'invalid_json', message: 'Invalid JSON' } }));
        return;
      }

      if (!authenticated) {
        if (msg.type !== MessageType.AUTH) {
          ws.close(4002, 'not_authenticated');
          return;
        }
        const payload = msg.payload as AuthPayload;
        // token 校验改为查数据库：后台新增服务器时自动生成的 token
        const client = await Client.findOne({ where: { token: payload.token } });
        if (!client) {
          ws.send(JSON.stringify({
            id: uuidv4(),
            type: MessageType.AUTH_RESULT,
            timestamp: Date.now(),
            payload: { success: false, reason: 'invalid_token' },
          }));
          ws.close(4003, 'invalid_token');
          return;
        }

        clearTimeout(authTimeout);
        authenticated = true;

        const remoteIp = req.socket.remoteAddress || '';
        await client.update({
          hostname: payload.hostname,
          os: payload.os,
          arch: payload.arch,
          osPlatform: payload.osPlatform || null,
          osVersion: payload.osVersion || null,
          agentVersion: payload.version,
          ipAddress: remoteIp,
        });

        // 解析 IP 归属国家并入库（异步、失败不阻断注册），完成后推送给仪表盘刷新。
        resolveCountry(remoteIp).then(async (geo) => {
          if (!geo.country) return;
          await client.update({ country: geo.country, countryName: geo.countryName });
          clientManager.broadcastToDashboards({
            type: 'client_geo',
            payload: { clientId: client.id, country: geo.country, countryName: geo.countryName },
          });
        }).catch(() => {});

        clientId = client.id;
        dbId = client.id;

        clientManager.registerAgent(clientId, dbId, ws, {
          hostname: payload.hostname,
          os: payload.os,
          arch: payload.arch,
          version: payload.version,
          ipAddress: remoteIp,
        });

        const clientConfig = await getOrCreateConfig(clientId);

        ws.send(JSON.stringify({
          id: uuidv4(),
          type: MessageType.AUTH_RESULT,
          timestamp: Date.now(),
          payload: { success: true, clientId, config: clientConfig },
        }));
        return;
      }

      switch (msg.type) {
        case MessageType.HEARTBEAT:
          clientManager.updateHeartbeat(clientId);
          ws.send(JSON.stringify({
            id: uuidv4(),
            type: MessageType.HEARTBEAT_ACK,
            timestamp: Date.now(),
            payload: {},
          }));
          break;

        case MessageType.METRICS_REPORT: {
          const metricsData = msg.payload as MetricsPayload;
          clientManager.updateHeartbeat(clientId);
          clientManager.broadcastMetrics(clientId, metricsData);
          await saveMetrics(dbId, metricsData);
          break;
        }

        case MessageType.CONFIG_REQUEST: {
          const cfg = await getOrCreateConfig(clientId);
          ws.send(JSON.stringify({
            id: uuidv4(),
            type: MessageType.CONFIG_UPDATE,
            timestamp: Date.now(),
            payload: { config: cfg },
          }));
          break;
        }

        case MessageType.COMMAND_RESULT: {
          const result = msg.payload as CommandResultPayload & { command?: string };
          clientManager.broadcastToDashboards({
            type: 'command_result',
            payload: { clientId, ...result, msgId: msg.id },
          });
          if (result.command) {
            await updateCommandResult(dbId, result.command, result.exitCode, result.stdout, result.stderr, result.duration);
          }
          break;
        }

        case MessageType.COMMAND_STREAM: {
          clientManager.broadcastToDashboards({
            type: 'command_stream',
            payload: { clientId, ...(msg.payload as Record<string, unknown>), msgId: msg.id },
          });
          break;
        }

        case MessageType.TERMINAL_DATA: {
          const termData = msg.payload as TerminalDataPayload;
          terminalService.sendData(termData.sessionId, termData.data, false);
          break;
        }

        case MessageType.TERMINAL_CLOSE: {
          const termClose = msg.payload as TerminalClosePayload;
          terminalService.closeSession(termClose.sessionId, termClose.reason);
          break;
        }

        default:
          ws.send(JSON.stringify({
            id: uuidv4(),
            type: MessageType.ERROR,
            timestamp: Date.now(),
            payload: { code: 'unknown_type', message: `Unknown message type: ${msg.type}` },
          }));
      }
    });

    ws.on('close', () => {
      if (clientId) {
        clientManager.unregisterAgent(clientId);
        terminalService.handleAgentDisconnect(clientId);
      }
    });

    ws.on('error', () => {
      if (clientId) {
        clientManager.unregisterAgent(clientId);
        terminalService.handleAgentDisconnect(clientId);
      }
    });
  });

  return wss;
}

export function createDashboardWss(server: any): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'missing_token');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret) as { userId: string };
      const connId = uuidv4();
      clientManager.registerDashboard(connId, ws, decoded.userId);

      ws.send(JSON.stringify({
        type: 'init',
        payload: { clients: clientManager.getAllClients() },
      }));

      ws.on('message', (raw: Buffer) => {
        let msg: any;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        switch (msg.type) {
          case 'terminal_open': {
            const sessionId = terminalService.openSession(
              msg.payload.clientId,
              ws,
              msg.payload.cols || 80,
              msg.payload.rows || 24
            );
            ws.send(JSON.stringify({
              type: 'terminal_opened',
              payload: { sessionId, success: !!sessionId },
            }));
            break;
          }
          case 'terminal_data': {
            terminalService.sendData(msg.payload.sessionId, msg.payload.data, true);
            break;
          }
          case 'terminal_resize': {
            terminalService.resize(msg.payload.sessionId, msg.payload.cols, msg.payload.rows);
            break;
          }
          case 'terminal_close': {
            terminalService.closeSession(msg.payload.sessionId, 'user_closed');
            break;
          }
        }
      });

      ws.on('close', () => {
        clientManager.unregisterDashboard(connId);
      });
    } catch {
      ws.close(4003, 'invalid_token');
    }
  });

  return wss;
}
