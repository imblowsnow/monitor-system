<template>
  <div class="public-page">
    <!-- 顶栏 -->
    <header class="pub-header">
      <div class="pub-header-inner">
        <div class="brand">
          <div class="brand-mark"><el-icon :size="20"><Monitor /></el-icon></div>
          <span class="brand-name">服务状态</span>
        </div>
        <div class="header-actions">
          <ThemeToggle />
          <router-link to="/admin/login" class="admin-link">管理后台</router-link>
        </div>
      </div>
    </header>

    <main class="pub-main">
      <!-- 整体状态横幅 -->
      <section class="overall" :class="overallClass">
        <div class="overall-icon">
          <el-icon :size="30">
            <CircleCheckFilled v-if="overallClass === 'ok'" />
            <WarningFilled v-else-if="overallClass === 'warn'" />
            <CircleCloseFilled v-else />
          </el-icon>
        </div>
        <div class="overall-text">
          <h1>{{ overallTitle }}</h1>
          <p>{{ servers.length }} 个服务 · {{ onlineCount }} 个在线 · 最近更新 {{ updatedAt }}</p>
        </div>
        <div class="overall-uptime">
          <div class="ou-num">{{ overallUptime === '—' ? '—' : overallUptime + '%' }}</div>
          <div class="ou-label">{{ hbRangeLabel }}整体可用率</div>
        </div>
      </section>

      <!-- 工具栏 -->
      <div class="pub-toolbar">
        <el-input
          v-model="search"
          placeholder="搜索服务"
          clearable
          :prefix-icon="Search"
          class="pub-search"
        />
        <el-radio-group v-model="hbRange" size="default" class="pub-range" @change="load">
          <el-radio-button value="24h">24 小时</el-radio-button>
          <el-radio-button value="7d">7 天</el-radio-button>
          <el-radio-button value="30d">30 天</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 分组 Tabs -->
      <el-tabs v-if="groups.length > 1" v-model="groupFilter" class="pub-tabs">
        <el-tab-pane name="">
          <template #label>全部 <span class="pub-tab-cnt">{{ servers.length }}</span></template>
        </el-tab-pane>
        <el-tab-pane v-for="g in groups" :key="g" :name="g">
          <template #label>{{ g }} <span class="pub-tab-cnt">{{ groupCount(g) }}</span></template>
        </el-tab-pane>
      </el-tabs>

      <!-- 服务列表(按分组) -->
      <div v-loading="loading" class="server-groups">
        <template v-for="grp in groupedServers" :key="grp.name">
          <div class="group-block">
            <div v-if="groups.length > 1" class="group-title">
              <span>{{ grp.name }}</span>
              <span class="group-count">{{ grp.items.length }}</span>
            </div>
            <div class="server-list">
              <article
                v-for="s in grp.items"
                :key="s.id"
                class="server-card"
                @click="goDetail(s.id)"
              >
                <div class="sc-head">
                  <span class="status-dot" :class="[s.status, { pulse: s.status === 'online' }]" />
                  <div class="sc-title">
                    <div class="sc-name">{{ s.name }}</div>
                    <div class="sc-status" :class="s.status">{{ statusLabel(s.status) }}</div>
                  </div>
                  <div class="sc-uptime" :class="uptimeClass(s.uptime)">{{ uptimeText(s.uptime) }}</div>
                </div>
                <HeartbeatBar :beats="beatsOf(s)" />
                <div class="sc-foot">
                  <span>{{ hbRangeLabel }}</span>
                  <span>现在</span>
                </div>
              </article>
            </div>
          </div>
        </template>

        <el-empty v-if="!loading && !servers.length" description="暂无服务" />
      </div>
    </main>

    <footer class="pub-footer">
      <span>Monitor System · 自动每 30 秒刷新</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Monitor, Search, CircleCheckFilled, WarningFilled, CircleCloseFilled,
} from '@element-plus/icons-vue';
import ThemeToggle from '../../components/ThemeToggle.vue';
import HeartbeatBar from '../../components/HeartbeatBar.vue';
import { fetchPublicStatus, type PublicServer } from '../../api/public';
import { buildBeats, statusLabel, formatTime } from '../../utils/format';

const router = useRouter();
const servers = ref<PublicServer[]>([]);
const loading = ref(false);
const search = ref('');
const groupFilter = ref('');
const updatedAt = ref('—');
const hbRange = ref<'24h' | '7d' | '30d'>('24h');
let timer: ReturnType<typeof setInterval> | null = null;

// 心跳条时间窗口:24h / 7d / 30d 三档,对应小时数与展示文案
const HB_RANGES = {
  '24h': { hours: 24, label: '24 小时' },
  '7d': { hours: 24 * 7, label: '7 天' },
  '30d': { hours: 24 * 30, label: '30 天' },
} as const;
const hbRangeLabel = computed(() => HB_RANGES[hbRange.value].label);

const onlineCount = computed(() => servers.value.filter(s => s.status === 'online').length);
const groups = computed(() => [...new Set(servers.value.map(s => s.group || 'default'))]);

function groupCount(g: string) {
  return servers.value.filter(s => (s.group || 'default') === g).length;
}

const filtered = computed(() =>
  servers.value.filter(s => {
    if (groupFilter.value && (s.group || 'default') !== groupFilter.value) return false;
    if (search.value && !s.name.toLowerCase().includes(search.value.toLowerCase())) return false;
    return true;
  })
);

const groupedServers = computed(() => {
  const map = new Map<string, PublicServer[]>();
  for (const s of filtered.value) {
    const g = s.group || 'default';
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(s);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});

const overallUptime = computed(() => {
  const vals = servers.value.map(s => s.uptime).filter((v): v is number => v != null);
  if (!vals.length) return '—';
  const sum = vals.reduce((acc, v) => acc + v, 0);
  return (sum / vals.length).toFixed(1);
});

const overallClass = computed(() => {
  if (!servers.value.length) return 'ok';
  const down = servers.value.filter(s => s.status === 'offline').length;
  const warn = servers.value.filter(s => s.status === 'warning').length;
  if (down > 0) return 'down';
  if (warn > 0) return 'warn';
  return 'ok';
});

const overallTitle = computed(() => {
  switch (overallClass.value) {
    case 'ok':
      return '所有系统运行正常';
    case 'warn':
      return '部分系统出现异常';
    default:
      return '部分系统不可用';
  }
});

function beatsOf(s: PublicServer) {
  return buildBeats(s.timeline || [], 44, HB_RANGES[hbRange.value].hours);
}

function uptimeClass(v: number | null) {
  if (v == null) return 'empty';
  if (v >= 99) return 'online';
  if (v >= 90) return 'warning';
  return 'offline';
}

function uptimeText(v: number | null) {
  return v == null ? '—' : `${v}%`;
}

function goDetail(id: string) {
  router.push(`/status/${id}`);
}

async function load() {
  try {
    servers.value = await fetchPublicStatus(HB_RANGES[hbRange.value].hours);
    updatedAt.value = formatTime(Date.now());
  } catch {
    // 静默,保留旧数据
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  await load();
  timer = setInterval(load, 30_000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.public-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-body);
}

/* 顶栏 */
.pub-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
}
.pub-header-inner {
  max-width: 960px;
  margin: 0 auto;
  height: 60px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-1);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.admin-link {
  font-size: 13px;
  color: var(--text-2);
  text-decoration: none;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  transition: all 0.18s ease;
}
.admin-link:hover {
  color: var(--brand);
  border-color: var(--brand);
}

/* 主体 */
.pub-main {
  flex: 1;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 28px 20px 48px;
}

/* 整体横幅 */
.overall {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 22px 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}
.overall.ok {
  border-left: 4px solid var(--c-up);
}
.overall.warn {
  border-left: 4px solid var(--c-warn);
}
.overall.down {
  border-left: 4px solid var(--c-down);
}
.overall-icon {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.overall.ok .overall-icon {
  background: var(--c-up-soft);
  color: var(--c-up);
}
.overall.warn .overall-icon {
  background: var(--c-warn-soft);
  color: var(--c-warn);
}
.overall.down .overall-icon {
  background: var(--c-down-soft);
  color: var(--c-down);
}
.overall-text {
  flex: 1;
}
.overall-text h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-1);
}
.overall-text p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-2);
}
.overall-uptime {
  text-align: right;
}
.ou-num {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-1);
  line-height: 1;
}
.ou-label {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 4px;
}

/* 工具栏 */
.pub-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0 16px;
}
.pub-search {
  max-width: 280px;
  flex: 1;
}
.pub-range {
  margin-left: auto;
  flex-shrink: 0;
}

/* 分组 Tabs */
.pub-tabs {
  margin: 0 0 8px;
}
.pub-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.pub-tab-cnt {
  display: inline-block;
  min-width: 18px;
  padding: 0 5px;
  margin-left: 4px;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  border-radius: 8px;
  background: var(--bg-inset);
  color: var(--text-3);
}

/* 分组与列表 */
.server-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 120px;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}
.group-count {
  background: var(--bg-inset);
  color: var(--text-3);
  border-radius: 999px;
  padding: 1px 9px;
  font-size: 12px;
}
.server-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.server-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.server-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}
.sc-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.sc-title {
  flex: 1;
  min-width: 0;
}
.sc-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sc-status {
  font-size: 12px;
  margin-top: 2px;
}
.sc-status.online {
  color: var(--c-up);
}
.sc-status.warning {
  color: var(--c-warn);
}
.sc-status.offline {
  color: var(--c-down);
}
.sc-status.empty {
  color: var(--text-3);
}
.sc-uptime {
  font-size: 16px;
  font-weight: 700;
}
.sc-uptime.online {
  color: var(--c-up);
}
.sc-uptime.warning {
  color: var(--c-warn);
}
.sc-uptime.offline {
  color: var(--c-down);
}
.sc-uptime.empty {
  color: var(--text-3);
}
.sc-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-3);
}

/* 页脚 */
.pub-footer {
  text-align: center;
  padding: 24px;
  font-size: 12px;
  color: var(--text-3);
  border-top: 1px solid var(--border);
}

@media (max-width: 600px) {
  .overall {
    flex-wrap: wrap;
  }
  .overall-uptime {
    width: 100%;
    text-align: left;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
}
</style>
