import type { ClientConfig } from './types/config.js';

export enum MessageType {
  AUTH = 'auth',
  AUTH_RESULT = 'auth_result',
  HEARTBEAT = 'heartbeat',
  HEARTBEAT_ACK = 'heartbeat_ack',
  METRICS_REPORT = 'metrics_report',
  COMMAND_REQUEST = 'command_request',
  COMMAND_RESULT = 'command_result',
  COMMAND_STREAM = 'command_stream',
  TERMINAL_OPEN = 'terminal_open',
  TERMINAL_DATA = 'terminal_data',
  TERMINAL_RESIZE = 'terminal_resize',
  TERMINAL_CLOSE = 'terminal_close',
  FILE_LIST_REQ = 'file_list_req',
  FILE_LIST_RES = 'file_list_res',
  FILE_UPLOAD = 'file_upload',
  FILE_DOWNLOAD = 'file_download',
  FILE_CHUNK = 'file_chunk',
  CONFIG_REQUEST = 'config_request',
  CONFIG_UPDATE = 'config_update',
  COLLECTOR_REPORT = 'collector_report',
  CLIENT_INFO = 'client_info',
  ERROR = 'error',
}

export interface WSMessage<T = unknown> {
  id: string;
  type: MessageType;
  timestamp: number;
  payload: T;
}

export interface AuthPayload {
  token: string;
  hostname: string;
  os: string;
  arch: string;
  version: string;
  /** 操作系统发行版标识，如 ubuntu / centos / debian（来自 gopsutil host.Info）。 */
  osPlatform?: string;
  /** 发行版版本号，如 22.04。 */
  osVersion?: string;
}

export interface AuthResultPayload {
  success: boolean;
  reason?: string;
  clientId?: string;
  config?: ClientConfig;
}

export interface HeartbeatPayload {
  uptime: number;
}

export interface MetricsPayload {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    usage: number;
  };
  disk: Array<{
    mount: string;
    total: number;
    used: number;
    usage: number;
  }>;
  network: {
    rxBytes: number;
    txBytes: number;
    rxSpeed: number;
    txSpeed: number;
  };
  processes: number;
  connections: {
    tcp: number;
    udp: number;
  };
  uptime: number;
  /** 扩展采集器（netnodes/docker/...）结果，以采集器名为 key 直接平铺到顶层。 */
  [collector: string]: unknown;
}

export interface CommandRequestPayload {
  command: string;
  timeout: number;
}

export interface CommandResultPayload {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface CommandStreamPayload {
  stream: 'stdout' | 'stderr';
  data: string;
  done: boolean;
}

export interface TerminalOpenPayload {
  sessionId: string;
  cols: number;
  rows: number;
  shell?: string;
}

export interface TerminalDataPayload {
  sessionId: string;
  data: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalClosePayload {
  sessionId: string;
  reason?: string;
}

export interface FileListReqPayload {
  path: string;
}

export interface FileListResPayload {
  path: string;
  entries: Array<{
    name: string;
    isDir: boolean;
    size: number;
    modTime: string;
    permissions: string;
  }>;
}

export interface FileChunkPayload {
  transferId: string;
  offset: number;
  data: string;
  done: boolean;
  totalSize?: number;
  filename?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface CollectorReportPayload {
  collector: string;
  data: unknown;
  error?: string;
}
