export interface MetricsRecord {
  id: number;
  clientId: string;
  collectedAt: Date;
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsage: Array<{
    mount: string;
    total: number;
    used: number;
    percent: number;
  }>;
  network: {
    rxBytes: number;
    txBytes: number;
    rxSpeed: number;
    txSpeed: number;
  };
  loadAvg: number[];
  processes: number;
  uptime: number;
}
