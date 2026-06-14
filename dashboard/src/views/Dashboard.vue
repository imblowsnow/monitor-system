<template>
  <div class="dash">
    <!-- 状态概览 -->
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-icon up"><el-icon><CircleCheckFilled /></el-icon></div>
        <div class="stat-body">
          <div class="stat-num">{{ clientsStore.onlineCount }}</div>
          <div class="stat-label">在线</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon down"><el-icon><CircleCloseFilled /></el-icon></div>
        <div class="stat-body">
          <div class="stat-num">{{ clientsStore.offlineCount }}</div>
          <div class="stat-label">离线</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon warn"><el-icon><WarningFilled /></el-icon></div>
        <div class="stat-body">
          <div class="stat-num">{{ warningCount }}</div>
          <div class="stat-label">异常</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon total"><el-icon><Histogram /></el-icon></div>
        <div class="stat-body">
          <div class="stat-num">{{ overallUptime === '—' ? '—' : overallUptime + '%' }}</div>
          <div class="stat-label">整体可用率 (24h)</div>
        </div>
      </div>
    </div>

    <!-- 分组 Tabs -->
    <el-tabs v-model="groupFilter" class="grp-tabs">
      <el-tab-pane name="">
        <template #label>全部 <span class="tab-cnt">{{ clientsStore.clients.length }}</span></template>
      </el-tab-pane>
      <el-tab-pane v-for="g in groups" :key="g" :name="g">
        <template #label>{{ g }} <span class="tab-cnt">{{ groupCount(g) }}</span></template>
      </el-tab-pane>
    </el-tabs>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-input v-model="search" placeholder="搜索节点" clearable class="search" :prefix-icon="Search" />
        <el-radio-group v-model="statusFilter">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="online">在线</el-radio-button>
          <el-radio-button value="offline">离线</el-radio-button>
        </el-radio-group>
      </div>
      <div class="toolbar-right">
        <el-button-group>
          <el-button :type="view === 'card' ? 'primary' : 'default'" :icon="Grid" @click="view = 'card'" />
          <el-button :type="view === 'list' ? 'primary' : 'default'" :icon="List" @click="view = 'list'" />
        </el-button-group>
        <el-button type="primary" :icon="Plus" @click="openCreate">添加节点</el-button>
      </div>
    </div>

    <!-- 卡片视图 -->
    <div v-if="view === 'card'" class="card-grid" v-loading="clientsStore.loading">
      <div
        v-for="c in filteredClients"
        :key="c.id"
        class="node-card"
        @click="$router.push(`/admin/clients/${c.id}`)"
      >
        <div class="node-head">
          <span class="status-dot" :class="[c.status, { pulse: c.status === 'online' }]" />
          <div class="node-title">
            <div class="node-name">{{ c.name }}</div>
            <div class="node-sub">{{ c.hostname || c.ipAddress || '-' }}</div>
          </div>
          <div class="node-uptime" :class="c.status">{{ uptimeText(c.id) }}</div>
        </div>
        <HeartbeatBar :beats="getBeats(c.id)" />
        <div class="node-foot">
          <el-tag size="small" effect="plain" round>{{ c.groupName || 'default' }}</el-tag>
          <span v-if="c.country" :class="`fi fi-${c.country}`" :title="c.countryName || c.country" class="node-flag" />
          <span class="node-os">{{ osLabel(c) }}</span>
          <div class="node-actions" @click.stop>
            <el-button size="small" text :icon="Edit" @click="openEdit(c)" />
            <el-button size="small" text :icon="Setting" @click="openConfig(c)" />
            <el-button size="small" text type="warning" :icon="Download" @click="openInstall(c)" />
            <el-button size="small" text type="success" :icon="Platform" @click="openTerminal(c)" />
            <el-button size="small" text type="danger" :icon="Delete" @click="removeClient(c)" />
          </div>
        </div>
      </div>
      <el-empty v-if="!filteredClients.length && !clientsStore.loading" description="暂无节点" class="empty" />
    </div>

    <!-- 列表视图 -->
    <div v-else class="surface list-card">
      <el-table :data="filteredClients" v-loading="clientsStore.loading">
        <el-table-column label="排序" width="120" v-if="canSort">
          <template #default="{ $index }">
            <el-button size="small" text :icon="Top" :disabled="$index === 0" @click="moveClient($index, -1)" />
            <el-button size="small" text :icon="Bottom" :disabled="$index === filteredClients.length - 1" @click="moveClient($index, 1)" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="120">
          <template #default="{ row }">
            <span class="status-dot inline" :class="row.status" />{{ row.name }}
          </template>
        </el-table-column>
        <el-table-column prop="hostname" label="主机名" min-width="120" />
        <el-table-column label="IP" width="160">
          <template #default="{ row }">
            <span v-if="row.country" :class="`fi fi-${row.country}`" :title="row.countryName || row.country" class="node-flag" />
            {{ row.ipAddress || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="系统" width="130">
          <template #default="{ row }">{{ osLabel(row) }}</template>
        </el-table-column>
        <el-table-column prop="groupName" label="分组" width="110" />
        <el-table-column label="24h 可用率" width="110">
          <template #default="{ row }">
            <span :class="['pct', row.status]">{{ uptimeText(row.id) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="24h 在线" min-width="220">
          <template #default="{ row }">
            <HeartbeatBar :beats="getBeats(row.id)" :compact="true" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="400" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="$router.push(`/admin/clients/${row.id}`)">详情</el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="openConfig(row)">配置</el-button>
            <el-button size="small" type="warning" @click="openInstall(row)">安装</el-button>
            <el-button size="small" type="success" @click="openTerminal(row)">终端</el-button>
            <el-button size="small" type="danger" @click="removeClient(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 添加 / 编辑节点 -->
    <el-dialog v-model="showEditDialog" :title="editingId ? '编辑节点' : '添加节点'" width="480px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="分组">
          <el-input v-model="editForm.groupName" placeholder="default" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="editForm.tags" multiple filterable allow-create default-first-option
            placeholder="输入后回车添加" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveClient">确定</el-button>
      </template>
    </el-dialog>

    <!-- 采集配置 -->
    <el-dialog v-model="showConfigDialog" :title="`采集配置 · ${configTarget?.name || ''}`" width="460px">
      <el-form :model="configForm" label-width="120px" v-loading="configLoading">
        <el-form-item label="上报间隔(秒)">
          <el-input-number v-model="configForm.reportInterval" :min="1" :max="60" />
        </el-form-item>
        <el-form-item label="Docker 采集">
          <el-switch v-model="configForm.docker" />
          <span class="form-hint">采集本机 Docker 容器信息</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveConfig" :disabled="configLoading">保存并下发</el-button>
      </template>
    </el-dialog>

    <!-- 安装命令 -->
    <InstallDialog v-model="showInstallDialog" :client="installTarget" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  CircleCheckFilled, CircleCloseFilled, WarningFilled, Histogram,
  Search, Grid, List, Plus, Monitor, Platform, Top, Bottom, Delete, Edit, Setting, Download,
} from '@element-plus/icons-vue';
import { useClientsStore } from '../stores/clients';
import type { ClientInfo } from '../stores/clients';
import api from '../api/index';
import HeartbeatBar from '../components/HeartbeatBar.vue';
import InstallDialog from '../components/InstallDialog.vue';
import { buildBeats, uptimePercent, type Segment } from '../utils/format';

const router = useRouter();
const clientsStore = useClientsStore();
const groupFilter = ref('');
const statusFilter = ref('');
const search = ref('');
const view = ref<'card' | 'list'>('card');
const uptimeMap = ref<Record<string, Segment[]>>({});

// 仅在「无筛选 + 列表视图」时允许拖动排序，避免对过滤后的子集排序产生歧义
const canSort = computed(() =>
  view.value === 'list' && !groupFilter.value && !statusFilter.value && !search.value
);

const groups = computed(() => [...new Set(clientsStore.clients.map(c => c.groupName))]);
const warningCount = computed(() => clientsStore.clients.filter(c => c.status === 'warning').length);

function groupCount(g: string) {
  return clientsStore.clients.filter(c => c.groupName === g).length;
}

// 系统展示：优先「发行版 版本」如 ubuntu 22.04，回退到 os（linux/windows）。
function osLabel(c: { os?: string; osPlatform?: string; osVersion?: string }) {
  const platform = c.osPlatform || c.os || '';
  if (!platform) return '-';
  const name = platform.charAt(0).toUpperCase() + platform.slice(1);
  return c.osVersion ? `${name} ${c.osVersion}` : name;
}

const filteredClients = computed(() =>
  clientsStore.clients.filter(c => {
    if (groupFilter.value && c.groupName !== groupFilter.value) return false;
    if (statusFilter.value && c.status !== statusFilter.value) return false;
    if (search.value) {
      const q = search.value.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !(c.hostname || '').toLowerCase().includes(q)) return false;
    }
    return true;
  })
);

const overallUptime = computed(() => {
  const vals = clientsStore.clients
    .map(c => uptimeOf(c.id))
    .filter((v): v is number => v != null);
  if (!vals.length) return '—';
  const sum = vals.reduce((acc, v) => acc + v, 0);
  return (sum / vals.length).toFixed(1);
});

function getBeats(clientId: string) {
  return buildBeats(uptimeMap.value[clientId] || [], 40, 24);
}

function uptimeOf(clientId: string) {
  return uptimePercent(uptimeMap.value[clientId] || []);
}

function uptimeText(clientId: string) {
  const v = uptimeOf(clientId);
  return v == null ? '—' : `${v}%`;
}

function openTerminal(row: { id: string; name: string }) {
  router.push({ name: 'Terminal', query: { clientId: row.id, name: row.name } });
}

// ---------- 安装命令 ----------
const showInstallDialog = ref(false);
const installTarget = ref<ClientInfo | null>(null);

function openInstall(row: ClientInfo) {
  installTarget.value = row;
  showInstallDialog.value = true;
}

// ---------- 添加 / 编辑 ----------
const showEditDialog = ref(false);
const editingId = ref<string | null>(null);
const editForm = reactive({ name: '', groupName: 'default', tags: [] as string[] });

function openCreate() {
  editingId.value = null;
  Object.assign(editForm, { name: '', groupName: 'default', tags: [] });
  showEditDialog.value = true;
}

function openEdit(row: any) {
  editingId.value = row.id;
  Object.assign(editForm, {
    name: row.name,
    groupName: row.groupName || 'default',
    tags: Array.isArray(row.tags) ? [...row.tags] : [],
  });
  showEditDialog.value = true;
}

async function saveClient() {
  if (!editForm.name) {
    ElMessage.warning('名称不能为空');
    return;
  }
  const payload = { name: editForm.name, groupName: editForm.groupName || 'default', tags: editForm.tags };
  if (editingId.value) {
    await api.put(`/clients/${editingId.value}`, payload);
    ElMessage.success('已保存');
  } else {
    await api.post('/clients', payload);
    ElMessage.success('添加成功');
  }
  showEditDialog.value = false;
  await clientsStore.fetchClients();
}

// ---------- 采集配置 ----------
const showConfigDialog = ref(false);
const configLoading = ref(false);
const configTarget = ref<{ id: string; name: string } | null>(null);
const configForm = reactive({ reportInterval: 5, docker: true });

async function openConfig(row: { id: string; name: string }) {
  configTarget.value = { id: row.id, name: row.name };
  showConfigDialog.value = true;
  configLoading.value = true;
  try {
    const { data } = await api.get(`/clients/${row.id}/config`);
    configForm.reportInterval = data.reportInterval ?? 5;
    configForm.docker = data.docker !== false;
  } finally {
    configLoading.value = false;
  }
}

async function saveConfig() {
  if (!configTarget.value) return;
  await api.put(`/clients/${configTarget.value.id}/config`, {
    reportInterval: configForm.reportInterval,
    docker: configForm.docker,
  });
  ElMessage.success('已保存并下发');
  showConfigDialog.value = false;
}

// ---------- 删除 ----------
async function removeClient(row: { id: string; name: string }) {
  try {
    await ElMessageBox.confirm(`确定删除节点「${row.name}」？此操作不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return; // 用户取消
  }
  await api.delete(`/clients/${row.id}`);
  ElMessage.success('已删除');
  await clientsStore.fetchClients();
}

// ---------- 排序 ----------
async function moveClient(index: number, dir: 1 | -1) {
  const list = clientsStore.clients;
  const target = index + dir;
  if (target < 0 || target >= list.length) return;
  const arr = [...list];
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item);
  clientsStore.clients = arr;
  await api.put('/clients/reorder', { order: arr.map(c => c.id) });
}

async function fetchUptime() {
  for (const c of clientsStore.clients) {
    try {
      const { data } = await api.get(`/clients/${c.id}/uptime?hours=24`);
      uptimeMap.value[c.id] = data.timeline || [];
    } catch {
      // 忽略单节点失败
    }
  }
}

onMounted(async () => {
  await clientsStore.fetchClients();
  fetchUptime();
});
</script>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 状态概览 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.stat-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.stat-icon.up { background: var(--c-up-soft); color: var(--c-up); }
.stat-icon.down { background: var(--c-down-soft); color: var(--c-down); }
.stat-icon.warn { background: var(--c-warn-soft); color: var(--c-warn); }
.stat-icon.total { background: var(--brand-soft); color: var(--brand); }
.stat-num { font-size: 26px; font-weight: 700; line-height: 1.1; color: var(--text-1); }
.stat-label { font-size: 13px; color: var(--text-3); margin-top: 2px; }

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.toolbar-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.toolbar-right { display: flex; align-items: center; gap: 12px; }
.search { width: 200px; }

/* 分组 Tabs */
.grp-tabs { margin-bottom: -4px; }
.grp-tabs :deep(.el-tabs__header) { margin-bottom: 0; }
.tab-cnt {
  display: inline-block;
  min-width: 18px;
  padding: 0 5px;
  margin-left: 4px;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  border-radius: 8px;
  background: var(--fill-2, rgba(127,127,127,0.12));
  color: var(--text-3);
}

/* 卡片网格 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 16px;
}
.node-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.node-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}
.node-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.node-title { flex: 1; min-width: 0; }
.node-name {
  font-size: 15px; font-weight: 600; color: var(--text-1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.node-sub { font-size: 12px; color: var(--text-3); margin-top: 2px; }
.node-uptime { font-size: 16px; font-weight: 700; }
.node-uptime.online { color: var(--c-up); }
.node-uptime.warning { color: var(--c-warn); }
.node-uptime.offline { color: var(--c-down); }
.node-uptime.empty { color: var(--text-3); }
.node-foot {
  display: flex; align-items: center; gap: 10px;
  margin-top: 14px; font-size: 12px; color: var(--text-3);
}
.node-os { flex: 1; }
.node-flag { width: 18px; height: 13px; border-radius: 2px; flex: none; box-shadow: 0 0 0 1px rgba(0,0,0,.08); }
.node-actions { display: flex; gap: 2px; }
.node-actions :deep(.el-button + .el-button) { margin-left: 0; }
.node-actions :deep(.el-button) { padding: 4px 6px; }

.status-dot.inline { margin-right: 8px; vertical-align: middle; }

.pct.online { color: var(--c-up); font-weight: 600; }
.pct.warning { color: var(--c-warn); font-weight: 600; }
.pct.offline { color: var(--c-down); font-weight: 600; }
.pct.empty { color: var(--text-3); font-weight: 600; }

.list-card { padding: 8px 12px; }
.empty { grid-column: 1 / -1; }

@media (max-width: 900px) {
  .stat-row { grid-template-columns: repeat(2, 1fr); }
}
.form-hint { margin-left: 10px; font-size: 12px; color: var(--text-3); }
</style>
