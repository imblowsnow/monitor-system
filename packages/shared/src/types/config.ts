export type ProbeType = 'http' | 'tcp' | 'icmp';

export interface NetNode {
  name: string;
  target: string;
  probe: ProbeType;
  isp?: string;
}

/**
 * 服务端下发给 Agent 的统一客户端配置。
 * netnodes 来自后台全局节点表里 enabled 的行，由服务端组装后下发。
 * 后续新增采集器若需配置，往这里加字段即可。
 */
export interface ClientConfig {
  reportInterval: number;
  netnodes: NetNode[];
  docker: boolean;
}
