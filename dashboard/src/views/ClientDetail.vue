<template>
  <div v-if="client" class="detail">
    <!-- 头部 -->
    <div class="detail-bar surface">
      <el-button :icon="ArrowLeft" circle @click="$router.back()" />
      <span class="status-dot" :class="[client.status, { pulse: client.status === 'online' }]" />
      <div class="db-title">
        <div class="db-name">{{ client.name }}</div>
        <div class="db-sub">{{ client.hostname }} · {{ client.os }}/{{ client.arch }} · {{ client.ipAddress || '-' }}</div>
      </div>
      <el-tag :type="statusType(client.status)" effect="light">{{ statusLabel(client.status) }}</el-tag>
      <span v-if="lastUpdate" class="last-upd">更新于 {{ lastUpdate }}</span>
      <el-button type="success" :icon="Platform" @click="openTerminal">终端</el-button>
    </div>

    <!-- 实时指标卡 -->
    <div class="metric-row">
      <div class="metric-card surface">
        <div class="mc-label">CPU</div>
        <div class="mc-value">{{ latestCpu }}%</div>
        <el-progress :percentage="latestCpu" :show-text="false" :stroke-width="6" :color="barColor(latestCpu)" />
      </div>
      <div class="metric-card surface">
        <div class="mc-label">内存</div>
        <div class="mc-value">{{ latestMem }}%</div>
        <el-progress :percentage="latestMem" :show-text="false" :stroke-width="6" :color="barColor(latestMem)" />
      </div>
      <div class="metric-card surface">
        <div class="mc-label">下行 / 上行</div>
        <div class="mc-value sm">{{ formatSpeed(latestRx) }} / {{ formatSpeed(latestTx) }}</div>
      </div>
      <div class="metric-card surface">
        <div class="mc-label">进程数</div>
        <div class="mc-value">{{ latestProcs }}</div>
      </div>
    </div>

    
    <!-- 时间范围切换 -->
    <div class="range-bar surface">
      <span class="range-label">时间范围</span>
      <el-radio-group v-model="range" size="small" @change="loadRange">
        <el-radio-button value="live">实时</el-radio-button>
        <el-radio-button value="today">今天</el-radio-button>
        <el-radio-button value="7d">7 天</el-radio-button>
        <el-radio-button value="30d">一个月</el-radio-button>
      </el-radio-group>
      <span v-if="rangeLoading" class="range-tip">加载中…</span>
      <span v-else-if="range !== 'live'" class="range-tip">{{ metricsHistory.length }} 个数据点</span>
    </div>

    <!-- 在线状态 -->
    <div class="surface panel">
      <div class="panel-head">
        <h3>{{ hbRangeLabel }}在线状态</h3>
        <span class="pct" :class="client.status">{{ uptimeOf }}%</span>
      </div>
      <HeartbeatBar :beats="beats" />
      <div class="tl-foot"><span>{{ hbRangeLabel }}前</span><span>现在</span></div>
    </div>


    <!-- 图表 -->
    <div class="chart-grid">
      <div class="surface panel">
        <div class="panel-head"><h3>CPU 使用率</h3></div>
        <v-chart :option="cpuOption" autoresize style="height: 240px" />
      </div>
      <div class="surface panel">
        <div class="panel-head"><h3>内存使用率</h3></div>
        <v-chart :option="memoryOption" autoresize style="height: 240px" />
      </div>
      <div class="surface panel">
        <div class="panel-head"><h3>网络流量</h3></div>
        <v-chart :option="networkOption" autoresize style="height: 240px" />
      </div>
      <div class="surface panel">
        <div class="panel-head"><h3>磁盘使用</h3></div>
        <el-table :data="latestDisk" size="small">
          <el-table-column prop="mount" label="挂载点" />
          <el-table-column label="使用率">
            <template #default="{ row }">
              <el-progress :percentage="Math.round(row.percent || row.usage || 0)" :stroke-width="10" />
            </template>
          </el-table-column>
          <el-table-column label="已用/总计">
            <template #default="{ row }">{{ formatBytes(row.used) }} / {{ formatBytes(row.total) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 测速节点 + Docker 同行 -->
    <div class="collector-grid" v-if="netnodeNames.length || hasDocker">
      <!-- 测速节点延迟走势 -->
      <div class="surface panel" v-if="netnodeNames.length">
        <div class="panel-head"><h3>测速节点延迟</h3><span class="upd">{{ collectorTime }}</span></div>
        <v-chart :option="netnodeChartOption" autoresize style="height: 240px" />
      </div>

      <!-- Docker 容器数量走势 -->
      <div class="surface panel" v-if="hasDocker">
        <div class="panel-head">
          <h3>Docker 容器数</h3>
          <span class="upd" v-if="docker?.available">{{ docker.version }} · 当前 {{ docker.containers?.length || 0 }} 个</span>
          <el-tag v-else size="small" type="info" effect="light">未启用 / 不可用</el-tag>
        </div>
        <v-chart :option="dockerChartOption" autoresize style="height: 240px" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Platform } from '@element-plus/icons-vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import api from '../api/index';
import { useWsStore } from '../stores/websocket';
import { useThemeStore } from '../stores/theme';
import HeartbeatBar from '../components/HeartbeatBar.vue';
import {
  buildBeats, uptimePercent, statusLabel, formatBytes, formatSpeed, formatTime, type Segment,
} from '../utils/format';

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const route = useRoute();
const router = useRouter();
const wsStore = useWsStore();
const theme = useThemeStore();
const client = ref<any>(null);
const metricsHistory = ref<any[]>([]);
const uptimeData = ref<Segment[]>([]);
const range = ref<'live' | 'today' | '7d' | '30d'>('live');
const rangeLoading = ref(false);
let unsubs: Array<() => void> = [];

// 降采样：固定范围数据点过多时图表会卡，等距抽样到 max 个点
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

// 切换时间范围：live 走实时（最近 60 条 + WS 追加），其余走 range 接口。
// 同时刷新在线状态心跳条（窗口跟随所选范围）。
async function loadRange() {
  loadUptime();
  if (range.value === 'live') {
    rangeLoading.value = true;
    try {
      const { data } = await api.get(`/clients/${route.params.id}/metrics?limit=60`);
      metricsHistory.value = data.reverse();
    } finally {
      rangeLoading.value = false;
    }
    return;
  }
  const to = new Date();
  const from = new Date(to);
  // 7 天按小时聚合（bucket=3600），一个月按 6 小时聚合（bucket=21600），
  // 服务端每桶返回一个 avg+min/max 点，不再受"今天点多、历史点少"影响；今天则取原始点。
  let bucket = 0;
  if (range.value === 'today') from.setHours(0, 0, 0, 0);
  else if (range.value === '7d') { from.setDate(from.getDate() - 7); bucket = 3600; }
  else if (range.value === '30d') { from.setDate(from.getDate() - 30); bucket = 21600; }
  rangeLoading.value = true;
  try {
    const { data } = await api.get(
      `/clients/${route.params.id}/metrics/range?from=${from.toISOString()}&to=${to.toISOString()}&bucket=${bucket}`,
    );
    metricsHistory.value = downsample(data, 720);
  } finally {
    rangeLoading.value = false;
  }
}

const axisColor = computed(() => (theme.mode === 'dark' ? '#647089' : '#94a3b8'));
const splitColor = computed(() => (theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'));

// 在线状态心跳条窗口跟随统一时间范围:实时/今天=24h,7天=7d,一个月=30d
const HB_HOURS: Record<typeof range.value, number> = {
  live: 24,
  today: 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};
const HB_LABELS: Record<typeof range.value, string> = {
  live: '24 小时',
  today: '24 小时',
  '7d': '7 天',
  '30d': '30 天',
};
const hbRangeLabel = computed(() => HB_LABELS[range.value]);

// 按当前时间范围拉取在线状态时间线
async function loadUptime() {
  const { data } = await api.get(`/clients/${route.params.id}/uptime?hours=${HB_HOURS[range.value]}`);
  uptimeData.value = data.timeline || [];
}

const beats = computed(() => buildBeats(uptimeData.value, 48, HB_HOURS[range.value]));
const uptimeOf = computed(() => uptimePercent(uptimeData.value));

const latest = computed(() => metricsHistory.value[metricsHistory.value.length - 1] || {});
const latestCpu = computed(() => Math.round(latest.value.cpuUsage ?? latest.value.cpu?.usage ?? 0));
const latestMem = computed(() => {
  const m = latest.value;
  if (m.memoryUsed && m.memoryTotal) return Math.round((m.memoryUsed / m.memoryTotal) * 100);
  if (m.memory?.usage) return Math.round(m.memory.usage);
  return 0;
});
const latestRx = computed(() => latest.value.network?.rxSpeed ?? 0);
const latestTx = computed(() => latest.value.network?.txSpeed ?? 0);
const latestProcs = computed(() => latest.value.processes ?? '-');
const latestDisk = computed(() => latest.value.diskUsage || latest.value.disk || []);

// 测速节点 / Docker 当前快照从最近一条指标派生；走势图则遍历整段历史
const docker = computed<any>(() => latest.value.docker || null);
const hasDocker = computed(() => metricsHistory.value.some(m => m.docker));
const collectorTime = computed(() => (latest.value.collectedAt ? formatTime(latest.value.collectedAt) : ''));
// 头部"最后更新时间"，与最近一条指标的采集时间一致
const lastUpdate = collectorTime;

function statusType(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'online') return 'success';
  if (status === 'warning') return 'warning';
  return 'danger';
}

function barColor(v: number) {
  if (v >= 90) return 'var(--c-down)';
  if (v >= 70) return 'var(--c-warn)';
  return 'var(--c-up)';
}

function openTerminal() {
  router.push({ name: 'Terminal', query: { clientId: client.value.id, name: client.value.name } });
}

// 横轴标签：7天/一个月跨多天，显示「月/日 时:分」；实时/今天只显示时分
function axisLabel(t: string | number | Date) {
  const d = new Date(t);
  if (range.value === '7d' || range.value === '30d') {
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return formatTime(t);
}

function baseChart(extra: Record<string, unknown>) {
  return {
    grid: { left: 44, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: metricsHistory.value.map(m => axisLabel(m.collectedAt)),
      axisLine: { lineStyle: { color: axisColor.value } },
      axisLabel: { color: axisColor.value, fontSize: 11 },
    },
    ...extra,
  };
}

// min~max 阴影带：聚合行带 *Min/*Max 时画半透明波动范围带；原始行（实时/今天）无极值则该点为 null，自然不显示。
// echarts 经典实现：下界线（透明、stack）打底 + 带宽线（max-min、stack、半透明 areaStyle）叠上去。
// stackId 须每张图唯一，避免多图 series 串台。
function bandSeries(
  stackId: string,
  rgb: string,
  getMin: (m: any) => number | null,
  getMax: (m: any) => number | null,
) {
  const data = metricsHistory.value;
  const hasBand = data.some(m => getMin(m) != null && getMax(m) != null);
  if (!hasBand) return [];
  return [
    {
      name: `${stackId}-lower`,
      type: 'line', stack: stackId, smooth: true, showSymbol: false,
      lineStyle: { opacity: 0 }, silent: true,
      tooltip: { show: false },
      data: data.map(m => getMin(m)),
    },
    {
      name: `${stackId}-band`,
      type: 'line', stack: stackId, smooth: true, showSymbol: false,
      lineStyle: { opacity: 0 }, silent: true,
      tooltip: { show: false },
      areaStyle: { color: `rgba(${rgb},0.16)` },
      data: data.map(m => {
        const lo = getMin(m); const hi = getMax(m);
        return lo != null && hi != null ? hi - lo : null;
      }),
    },
  ];
}

const cpuOption = computed(() => baseChart({
  yAxis: {
    type: 'value', max: 100,
    axisLabel: { formatter: '{value}%', color: axisColor.value, fontSize: 11 },
    splitLine: { lineStyle: { color: splitColor.value } },
  },
  series: [
    ...bandSeries('cpu', '59,130,246',
      m => m.cpu?.usageMin ?? null,
      m => m.cpu?.usageMax ?? null,
    ),
    {
      name: 'CPU',
      type: 'line', smooth: true, showSymbol: false,
      data: metricsHistory.value.map(m => Math.round(m.cpuUsage ?? m.cpu?.usage ?? 0)),
      itemStyle: { color: '#3b82f6' },
      areaStyle: { color: 'rgba(59,130,246,0.16)' },
    },
  ],
}));

const memoryOption = computed(() => baseChart({
  yAxis: {
    type: 'value', max: 100,
    axisLabel: { formatter: '{value}%', color: axisColor.value, fontSize: 11 },
    splitLine: { lineStyle: { color: splitColor.value } },
  },
  series: [
    ...bandSeries('mem', '34,197,94',
      m => m.memory?.usageMin ?? null,
      m => m.memory?.usageMax ?? null,
    ),
    {
      name: '内存',
      type: 'line', smooth: true, showSymbol: false,
      data: metricsHistory.value.map(m => {
        if (m.memoryUsed && m.memoryTotal) return Math.round((m.memoryUsed / m.memoryTotal) * 100);
        if (m.memory?.usage) return Math.round(m.memory.usage);
        return 0;
      }),
      itemStyle: { color: '#22c55e' },
      areaStyle: { color: 'rgba(34,197,94,0.16)' },
    },
  ],
}));

const networkOption = computed(() => baseChart({
  legend: { data: ['接收', '发送'], textStyle: { color: axisColor.value }, right: 0 },
  yAxis: {
    type: 'value',
    axisLabel: { formatter: (v: number) => formatSpeed(v), color: axisColor.value, fontSize: 11 },
    splitLine: { lineStyle: { color: splitColor.value } },
  },
  series: [
    ...bandSeries('net-rx', '59,130,246',
      m => m.network?.rxSpeedMin ?? null,
      m => m.network?.rxSpeedMax ?? null,
    ),
    ...bandSeries('net-tx', '245,158,11',
      m => m.network?.txSpeedMin ?? null,
      m => m.network?.txSpeedMax ?? null,
    ),
    { name: '接收', type: 'line', smooth: true, showSymbol: false, itemStyle: { color: '#3b82f6' }, data: metricsHistory.value.map(m => m.network?.rxSpeed ?? 0) },
    { name: '发送', type: 'line', smooth: true, showSymbol: false, itemStyle: { color: '#f59e0b' }, data: metricsHistory.value.map(m => m.network?.txSpeed ?? 0) },
  ],
}));

// 测速节点延迟走势：收集范围内出现过的所有节点，各画一条延迟线（超时点断开）
const netnodeNames = computed<string[]>(() => {
  const s = new Set<string>();
  metricsHistory.value.forEach(m => (m.netnodes || []).forEach((n: any) => s.add(n.name)));
  return [...s];
});
const netnodeChartOption = computed(() => baseChart({
  legend: { data: netnodeNames.value, textStyle: { color: axisColor.value }, type: 'scroll', right: 0 },
  yAxis: {
    type: 'value',
    axisLabel: { formatter: '{value} ms', color: axisColor.value, fontSize: 11 },
    splitLine: { lineStyle: { color: splitColor.value } },
  },
  series: netnodeNames.value.map(name => ({
    name, type: 'line', smooth: true, showSymbol: false, connectNulls: false,
    data: metricsHistory.value.map(m => {
      const n = (m.netnodes || []).find((x: any) => x.name === name);
      return n && n.ok ? Math.round(n.latencyMs) : null;
    }),
  })),
}));

// Docker 容器数量走势：available 时取容器数，不可用置 null（断开）
const dockerChartOption = computed(() => baseChart({
  yAxis: {
    type: 'value', minInterval: 1,
    axisLabel: { color: axisColor.value, fontSize: 11 },
    splitLine: { lineStyle: { color: splitColor.value } },
  },
  series: [{
    type: 'line', step: 'end', showSymbol: false,
    itemStyle: { color: '#8b5cf6' },
    areaStyle: { color: 'rgba(139,92,246,0.16)' },
    data: metricsHistory.value.map(m => (m.docker?.available ? (m.docker.containers?.length ?? 0) : null)),
  }],
}));

onMounted(async () => {
  const { data } = await api.get(`/clients/${route.params.id}`);
  client.value = data;

  const { data: history } = await api.get(`/clients/${route.params.id}/metrics?limit=60`);
  metricsHistory.value = history.reverse();

  await loadUptime();

  unsubs.push(wsStore.onMetrics(route.params.id as string, (metrics) => {
    // 仅实时模式追加 WS 推送；固定时间范围时保持快照不变
    if (range.value !== 'live') return;
    metricsHistory.value.push({ ...metrics, collectedAt: new Date().toISOString() });
    if (metricsHistory.value.length > 120) metricsHistory.value.shift();
    // netnodes / docker / collectorTime 均从 metricsHistory 最后一条派生，无需在此赋值
  }));

  // 监听在线状态变化，实时更新头部状态点 / 标签
  unsubs.push(wsStore.onStatus(route.params.id as string, (status) => {
    if (client.value) client.value.status = status;
  }));
});

onUnmounted(() => {
  unsubs.forEach(fn => fn());
  unsubs = [];
});
</script>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.detail-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
}
.db-title {
  flex: 1;
  min-width: 0;
}
.db-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-1);
}
.db-sub {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.metric-card {
  padding: 16px 18px;
}
.mc-label {
  font-size: 13px;
  color: var(--text-3);
  margin-bottom: 8px;
}
.mc-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-1);
  margin-bottom: 10px;
}
.mc-value.sm {
  font-size: 15px;
}

.panel {
  padding: 18px 20px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.panel-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
}
.pct {
  font-size: 16px;
  font-weight: 700;
}
.pct.online { color: var(--c-up); }
.pct.warning { color: var(--c-warn); }
.pct.offline { color: var(--c-down); }
.tl-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-3);
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.range-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
}
.range-label {
  font-size: 13px;
  color: var(--text-3);
}
.range-tip {
  font-size: 12px;
  color: var(--text-3);
}

.collector-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 900px) {
  .metric-row { grid-template-columns: repeat(2, 1fr); }
  .chart-grid { grid-template-columns: 1fr; }
  .collector-grid { grid-template-columns: 1fr; }
}
.upd { font-size: 12px; color: var(--text-3); }
.last-upd { font-size: 12px; color: var(--text-3); white-space: nowrap; }
.docker-err { font-size: 13px; color: var(--text-3); padding: 8px 0; }
</style>
