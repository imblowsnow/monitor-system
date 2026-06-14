// 生成 30 天测试指标数据的 SQL 文件（不直接写库，由用户自行执行）。
// 用法: node scripts/seed-metrics.mjs [clientId] [天数] [间隔分钟]
// 输出: scripts/seed-metrics.sql
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, 'seed-metrics.sql');

const CLIENT_ID = process.argv[2] || 'c82d4afe-cf60-4d9d-8800-cda5127d2493';
const DAYS = Number(process.argv[3] || 30);
const STEP_MIN = Number(process.argv[4] || 5);

// 生成与现有数据一致的时间字符串: "2026-06-14 10:21:29.213 +00:00"
function fmt(d) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)} +00:00`
  );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// 平滑昼夜波形 + 随机噪声
function diurnal(tMs, base, amp, phaseHr = 14) {
  const hr = (tMs / 3_600_000) % 24;
  return base + amp * Math.sin(((hr - phaseHr + 24) % 24) / 24 * 2 * Math.PI);
}

const NET_NODES = [
  { name: '中国电信', isp: 'CT', target: 'gd-ct-dualstack.ip.zstaticcdn.com', base: 30 },
  { name: '中国联通', isp: 'CU', target: 'gd-cu-dualstack.ip.zstaticcdn.com', base: 25 },
  { name: '中国移动', isp: 'CM', target: 'gd-cm-dualstack.ip.zstaticcdn.com', base: 33 },
  { name: 'BD', isp: 'BD', target: 'lf3-ips.zstaticcdn.com', base: 23 },
];

const DISKS = [
  { mount: 'C:', total: 274880000000, baseUsage: 91 },
  { mount: 'D:', total: 322122543104, baseUsage: 83 },
  { mount: 'E:', total: 426755747840, baseUsage: 93 },
];

const MEM_TOTAL = 68548108288;

function buildExtra(tMs, uptimeSec, rxTotal, txTotal) {
  const cpu = clamp(diurnal(tMs, 45, 30) + (Math.random() - 0.5) * 25, 2, 99);
  const memUsage = clamp(diurnal(tMs, 70, 18) + (Math.random() - 0.5) * 10, 20, 97);
  const rxSpeed = Math.round(clamp(diurnal(tMs, 6000, 5000) + (Math.random() - 0.3) * 8000, 0, 80000));
  const txSpeed = Math.round(clamp(diurnal(tMs, 4000, 3500) + (Math.random() - 0.3) * 6000, 0, 60000));

  return {
    connections: { tcp: Math.round(clamp(diurnal(tMs, 400, 250) + (Math.random() - 0.5) * 120, 30, 900)), udp: Math.round(50 + Math.random() * 120) },
    cpu: { cores: 12, usage: cpu },
    disk: DISKS.map(d => {
      const usage = clamp(d.baseUsage + (Math.random() - 0.5) * 4, 40, 99);
      return { mount: d.mount, total: d.total, usage, used: Math.round(d.total * usage / 100) };
    }),
    docker: { available: false, error: 'docker daemon not reachable' },
    memory: { total: MEM_TOTAL, usage: memUsage, used: Math.round(MEM_TOTAL * memUsage / 100) },
    netnodes: NET_NODES.map(n => {
      const ok = Math.random() > 0.02; // 偶发超时
      return {
        name: n.name, isp: n.isp, probe: 'icmp', target: n.target,
        latencyMs: ok ? +(n.base + (Math.random() - 0.4) * 12).toFixed(3) : 0,
        ok,
      };
    }),
    network: { rxBytes: rxTotal, rxSpeed, txBytes: txTotal, txSpeed },
    processes: Math.round(clamp(diurnal(tMs, 520, 80) + (Math.random() - 0.5) * 40, 200, 800)),
    uptime: uptimeSec,
  };
}

// SQLite 字符串字面量转义：单引号翻倍
function sqlStr(s) { return `'${String(s).replace(/'/g, "''")}'`; }

const now = Date.now();
const stepMs = STEP_MIN * 60_000;
const start = now - DAYS * 24 * 3600 * 1000;
const end = now - 2 * 3600 * 1000; // 留出最近 2 小时给真实实时数据

const values = [];
let rxTotal = 30_000_000_000;
let txTotal = 6_000_000_000;
let uptimeSec = 200_000;
for (let t = start; t <= end; t += stepMs) {
  const extra = buildExtra(t, uptimeSec, rxTotal, txTotal);
  values.push(`(${sqlStr(CLIENT_ID)}, ${sqlStr(fmt(new Date(t)))}, ${sqlStr(JSON.stringify(extra))})`);
  rxTotal += extra.network.rxSpeed * STEP_MIN * 60;
  txTotal += extra.network.txSpeed * STEP_MIN * 60;
  uptimeSec += STEP_MIN * 60;
}

// 分批 INSERT，每批 500 行，避免单条语句过长
const BATCH = 500;
let sql = `-- 测试数据: client_id=${CLIENT_ID}, ${DAYS} 天, 每 ${STEP_MIN} 分钟一条, 共 ${values.length} 条\n`;
sql += 'BEGIN;\n';
for (let i = 0; i < values.length; i += BATCH) {
  const chunk = values.slice(i, i + BATCH);
  sql += 'INSERT INTO "metrics" ("client_id", "collected_at", "extra") VALUES\n' + chunk.join(',\n') + ';\n';
}
sql += 'COMMIT;\n';

writeFileSync(OUT_PATH, sql, 'utf8');
console.log(`已生成 ${values.length} 条 INSERT -> ${OUT_PATH}`);
console.log(`客户端: ${CLIENT_ID} | 范围: ${fmt(new Date(start))} ~ ${fmt(new Date(end))}`);
