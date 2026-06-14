export interface Client {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  os: string;
  arch: string;
  /** 操作系统发行版标识，如 ubuntu / centos / windows。 */
  osPlatform: string;
  /** 发行版版本号，如 22.04。 */
  osVersion: string;
  /** ISO 3166-1 alpha-2 国家码（小写），由 IP 解析得到，如 cn / us。 */
  country: string;
  /** 国家中文/英文名，展示用。 */
  countryName: string;
  groupName: string;
  agentVersion: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type ClientStatus = 'online' | 'warning' | 'offline';

export interface ClientState {
  clientId: string;
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
