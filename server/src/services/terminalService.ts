import { clientManager } from './clientManager.js';
import { MessageType, type WSMessage, type TerminalOpenPayload, type TerminalDataPayload, type TerminalResizePayload, type TerminalClosePayload } from '@monitor/shared';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { TERMINAL_MAX_SESSIONS, TERMINAL_IDLE_TIMEOUT } from '@monitor/shared';

interface TerminalBridge {
  sessionId: string;
  clientId: string;
  dashboardWs: WebSocket;
  agentWs: WebSocket;
  lastActivity: number;
}

class TerminalService {
  private sessions = new Map<string, TerminalBridge>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  start() {
    this.cleanupTimer = setInterval(() => this.cleanupIdle(), 60_000);
  }

  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    for (const session of this.sessions.values()) {
      this.closeSession(session.sessionId, 'server_shutdown');
    }
  }

  openSession(clientId: string, dashboardWs: WebSocket, cols: number, rows: number): string | null {
    const agentWs = clientManager.getAgentWs(clientId);
    if (!agentWs) return null;

    const clientSessions = Array.from(this.sessions.values()).filter(s => s.clientId === clientId);
    if (clientSessions.length >= TERMINAL_MAX_SESSIONS) return null;

    const sessionId = uuidv4();
    this.sessions.set(sessionId, {
      sessionId,
      clientId,
      dashboardWs,
      agentWs,
      lastActivity: Date.now(),
    });

    const msg: WSMessage<TerminalOpenPayload> = {
      id: uuidv4(),
      type: MessageType.TERMINAL_OPEN,
      timestamp: Date.now(),
      payload: { sessionId, cols, rows },
    };
    agentWs.send(JSON.stringify(msg));

    return sessionId;
  }

  sendData(sessionId: string, data: string, fromDashboard: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivity = Date.now();
    const msg: WSMessage<TerminalDataPayload> = {
      id: uuidv4(),
      type: MessageType.TERMINAL_DATA,
      timestamp: Date.now(),
      payload: { sessionId, data },
    };

    const target = fromDashboard ? session.agentWs : session.dashboardWs;
    if (target.readyState === WebSocket.OPEN) {
      target.send(JSON.stringify(msg));
    }
  }

  resize(sessionId: string, cols: number, rows: number) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const msg: WSMessage<TerminalResizePayload> = {
      id: uuidv4(),
      type: MessageType.TERMINAL_RESIZE,
      timestamp: Date.now(),
      payload: { sessionId, cols, rows },
    };
    session.agentWs.send(JSON.stringify(msg));
  }

  closeSession(sessionId: string, reason?: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const msg: WSMessage<TerminalClosePayload> = {
      id: uuidv4(),
      type: MessageType.TERMINAL_CLOSE,
      timestamp: Date.now(),
      payload: { sessionId, reason },
    };

    if (session.agentWs.readyState === WebSocket.OPEN) {
      session.agentWs.send(JSON.stringify(msg));
    }
    if (session.dashboardWs.readyState === WebSocket.OPEN) {
      session.dashboardWs.send(JSON.stringify(msg));
    }

    this.sessions.delete(sessionId);
  }

  handleAgentDisconnect(clientId: string) {
    for (const [id, session] of this.sessions) {
      if (session.clientId === clientId) {
        this.closeSession(id, 'agent_disconnected');
      }
    }
  }

  private cleanupIdle() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > TERMINAL_IDLE_TIMEOUT) {
        this.closeSession(id, 'idle_timeout');
      }
    }
  }
}

export const terminalService = new TerminalService();
