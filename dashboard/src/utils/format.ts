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

/** 由状态时间线计算 online 时长占比(%)。无任何真实数据时返回 null。 */
export function uptimePercent(timeline: Segment[]): number | null {
  let online = 0;
  let total = 0;
  for (const seg of timeline) {
    if (seg.status === 'empty') continue; // 无数据段不计入
    const dur = new Date(seg.end).getTime() - new Date(seg.start).getTime();
    total += dur;
    if (seg.status === 'online') online += dur;
  }
  if (!total) return null;
  return Math.round((online / total) * 1000) / 10;
}

// 状态严重度:数值越大越严重。用于在一个时间槽内取「最差」状态,避免漏掉异常。
const STATUS_SEVERITY: Record<string, number> = {
  empty: 0,
  online: 1,
  warning: 2,
  offline: 3,
};

/**
 * 把状态时间线离散成 N 段心跳条。
 * windowHours: 时间窗口(小时);count: 心跳格数。
 *
 * 每个心跳格代表一段时间(windowHours/count),取该段内「最严重」的状态:
 * 只要这段时间里出现过 offline/warning,格子就会标红/标黄,不会因为采样点
 * 恰好落在正常区间而把异常跳过。
 */
export function buildBeats(timeline: Segment[], count = 40, windowHours = 24): Beat[] {
  const now = Date.now();
  const windowMs = windowHours * 3600_000;
  const start = now - windowMs;
  const slot = windowMs / count;
  const beats: Beat[] = [];

  for (let i = 0; i < count; i++) {
    const slotStart = start + slot * i;
    const slotEnd = slotStart + slot;
    let status = 'empty';
    for (const seg of timeline) {
      const s = new Date(seg.start).getTime();
      const e = new Date(seg.end).getTime();
      // 该段与当前时间槽有重叠
      if (s < slotEnd && e > slotStart) {
        if ((STATUS_SEVERITY[seg.status] ?? 0) > (STATUS_SEVERITY[status] ?? 0)) {
          status = seg.status;
        }
      }
    }
    const ts = formatDateTime(slotStart);
    beats.push({ status, tooltip: `${ts} · ${statusLabel(status)}` });
  }
  return beats;
}
