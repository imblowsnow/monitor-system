export interface CommandLog {
  id: number;
  clientId: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  executedBy: string;
  executedAt: Date;
  durationMs: number | null;
}
