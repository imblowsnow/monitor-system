/** 通用格式化与状态时间线工具,前台/后台共用。 */

export interface Segment {
  status: string;
  start: string;
  end: string;
}

export interface Beat {
  status: string;
  tooltip: string;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

export function formatSpeed(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B/s';
  if (bytes < 1024) return Math.round(bytes) + ' B/s';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB/s';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB/s';
}

export function formatTime(t: string | number | Date): string {
  return new Date(t).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateTime(t: string | number | Date): string {
  return new Date(t).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'online':
      return '在线';
    case 'warning':
      return '异常';
    case 'offline':
      return '离线';
    default:
      return '无数据';
  }
}

/** 由状态时间线计算 online 时长占比(%)。 */
export function uptimePercent(timeline: Segment[]): number {
  let online = 0;
  let total = 0;
  for (const seg of timeline) {
    const dur = new Date(seg.end).getTime() - new Date(seg.start).getTime();
    total += dur;
    if (seg.status === 'online') online += dur;
  }
  if (!total) return 100;
  return Math.round((online / total) * 1000) / 10;
}

/**
 * 把状态时间线离散成 N 段心跳条。
 * windowHours: 时间窗口(小时);count: 心跳格数。
 */
export function buildBeats(timeline: Segment[], count = 40, windowHours = 24): Beat[] {
  const now = Date.now();
  const windowMs = windowHours * 3600_000;
  const start = now - windowMs;
  const slot = windowMs / count;
  const beats: Beat[] = [];

  for (let i = 0; i < count; i++) {
    const mid = start + slot * i + slot / 2;
    let status = 'empty';
    for (const seg of timeline) {
      const s = new Date(seg.start).getTime();
      const e = new Date(seg.end).getTime();
      if (mid >= s && mid < e) {
        status = seg.status;
        break;
      }
    }
    const ts = formatDateTime(start + slot * i);
    beats.push({ status, tooltip: `${ts} · ${statusLabel(status)}` });
  }
  return beats;
}
