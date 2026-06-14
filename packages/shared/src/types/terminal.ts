export interface TerminalSession {
  sessionId: string;
  clientId: string;
  cols: number;
  rows: number;
  createdAt: number;
  lastActivity: number;
}
