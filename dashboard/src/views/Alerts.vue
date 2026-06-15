<template>
  <div class="page">
    <div class="page-head">
      <h2>告警</h2>
    </div>

    <el-tabs v-model="activeTab" class="surface tabs-wrap">
      <!-- ============ 告警规则 ============ -->
      <el-tab-pane label="告警规则" name="rules">
        <div class="tab-toolbar">
          <el-button type="primary" :icon="Plus" @click="openCreate">添加规则</el-button>
        </div>
        <el-table :data="rules" v-loading="loading">
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column label="指标" width="120">
            <template #default="{ row }">{{ metricLabel(row.metric) }}</template>
          </el-table-column>
          <el-table-column label="条件" width="120">
            <template #default="{ row }">
              <span v-if="row.metric === 'offline'">离线检测</span>
              <span v-else>{{ opLabel(row.operator) }} {{ row.threshold }}</span>
            </template>
          </el-table-column>
          <el-table-column label="持续" width="80">
            <template #default="{ row }">{{ row.durationSeconds }}s</template>
          </el-table-column>
          <el-table-column label="通知" min-width="140">
            <template #default="{ row }">{{ channelNames(row.notifyChannelIds) }}</template>
          </el-table-column>
          <el-table-column label="启用" width="70">
            <template #default="{ row }"><el-switch v-model="row.enabled" @change="toggleRule(row)" /></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" plain @click="openEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" plain @click="deleteRule(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ============ 通知渠道 ============ -->
      <el-tab-pane label="通知渠道" name="channels">
        <div class="tab-toolbar">
          <el-button type="primary" :icon="Plus" @click="openChannelCreate">添加渠道</el-button>
        </div>
        <el-table :data="channels" v-loading="channelLoading">
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column label="类型" width="140">
            <template #default="{ row }">{{ channelTypeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column label="配置摘要" min-width="200">
            <template #default="{ row }">{{ configSummary(row) }}</template>
          </el-table-column>
          <el-table-column label="启用" width="70">
            <template #default="{ row }"><el-switch v-model="row.enabled" @change="toggleChannel(row)" /></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" plain @click="openChannelEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" plain @click="deleteChannel(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <div class="surface panel">
      <div class="panel-head"><h3>告警事件</h3></div>
      <el-table :data="events">
        <el-table-column label="规则"><template #default="{ row }">{{ row.AlertRule?.name || row.ruleId }}</template></el-table-column>
        <el-table-column label="节点"><template #default="{ row }">{{ row.Client?.name || row.clientId }}</template></el-table-column>
        <el-table-column prop="currentValue" label="当前值" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'firing' ? 'danger' : 'success'" size="small">
              {{ row.status === 'firing' ? '触发中' : '已恢复' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="触发时间">
          <template #default="{ row }">{{ new Date(row.triggeredAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="pager"
        layout="total, prev, pager, next"
        :total="eventsTotal"
        :page-size="eventsPageSize"
        :current-page="eventsPage"
        @current-change="onEventsPageChange"
      />
    </div>

    <!-- 规则编辑对话框 -->
    <el-dialog v-model="showRuleDialog" :title="editId ? '编辑告警规则' : '添加告警规则'" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="指标">
          <el-select v-model="form.metric" style="width: 100%" @change="onMetricChange">
            <el-option label="CPU 使用率" value="cpu_usage" />
            <el-option label="内存使用率" value="memory_usage" />
            <el-option label="磁盘使用率" value="disk_usage" />
            <el-option label="节点离线" value="offline" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.metric !== 'offline'" label="条件">
          <el-select v-model="form.operator" style="width: 90px; margin-right: 10px">
            <el-option label=">" value="gt" />
            <el-option label="<" value="lt" />
            <el-option label="=" value="eq" />
          </el-select>
          <el-input-number v-model="form.threshold" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="持续时间(s)"><el-input-number v-model="form.durationSeconds" :min="0" /></el-form-item>
        <el-form-item label="目标分组">
          <el-select v-model="form.targetGroups" multiple style="width: 100%">
            <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="通知渠道">
          <el-select v-model="form.notifyChannelIds" multiple style="width: 100%" placeholder="选择已配置的通知渠道">
            <el-option v-for="c in channels" :key="c.id" :label="`${c.name} (${channelTypeLabel(c.type)})`" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRuleDialog = false">取消</el-button>
        <el-button type="primary" @click="submitRule">确定</el-button>
      </template>
    </el-dialog>

    <!-- 通知渠道编辑对话框 -->
    <el-dialog v-model="showChannelDialog" :title="channelEditId ? '编辑通知渠道' : '添加通知渠道'" width="500px">
      <el-form :model="channelForm" label-width="100px">
        <el-form-item label="名称"><el-input v-model="channelForm.name" placeholder="例如:运维邮箱" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="channelForm.type" style="width: 100%" @change="onChannelTypeChange">
            <el-option label="邮件" value="email" />
            <el-option label="Telegram" value="telegram" />
            <el-option label="企业微信" value="wechat_work" />
            <el-option label="Webhook" value="webhook" />
          </el-select>
        </el-form-item>
        <el-form-item v-for="f in channelFields(channelForm.type)" :key="f.key" :label="f.label">
          <el-input v-model="channelForm.config[f.key]" :placeholder="f.placeholder" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChannelDialog = false">取消</el-button>
        <el-button type="primary" @click="submitChannel">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import api from '../api/index';

interface Channel { id: string; name: string; type: string; config: Record<string, string>; enabled: boolean }

const activeTab = ref('rules');

const rules = ref<any[]>([]);
const events = ref<any[]>([]);
const eventsTotal = ref(0);
const eventsPage = ref(1);
const eventsPageSize = ref(20);
const groups = ref<string[]>([]);
const channels = ref<Channel[]>([]);
const loading = ref(false);
const channelLoading = ref(false);

/* ---------- 规则 ---------- */
const showRuleDialog = ref(false);
const editId = ref<string | null>(null);

function emptyForm() {
  return {
    name: '',
    metric: 'cpu_usage',
    operator: 'gt',
    threshold: 90,
    durationSeconds: 60,
    targetGroups: [] as string[],
    notifyChannelIds: [] as string[],
  };
}
const form = reactive(emptyForm());

function metricLabel(m: string) {
  return { cpu_usage: 'CPU 使用率', memory_usage: '内存使用率', disk_usage: '磁盘使用率', offline: '节点离线' }[m] || m;
}
function opLabel(op: string) {
  return op === 'gt' ? '>' : op === 'lt' ? '<' : '=';
}
function channelNames(ids: string[] | null) {
  if (!ids || !ids.length) return '—';
  return ids.map(id => channels.value.find(c => c.id === id)?.name || '已删除').join('、');
}

function onMetricChange() {
  if (form.metric === 'offline') {
    form.operator = 'eq';
    form.threshold = 1;
  }
}
function openCreate() {
  editId.value = null;
  Object.assign(form, emptyForm());
  showRuleDialog.value = true;
}
function openEdit(row: any) {
  editId.value = row.id;
  Object.assign(form, emptyForm(), {
    name: row.name,
    metric: row.metric,
    operator: row.operator,
    threshold: row.threshold,
    durationSeconds: row.durationSeconds,
    targetGroups: Array.isArray(row.targetGroups) ? [...row.targetGroups] : [],
    notifyChannelIds: Array.isArray(row.notifyChannelIds) ? [...row.notifyChannelIds] : [],
  });
  showRuleDialog.value = true;
}
async function submitRule() {
  const payload = { ...form };
  if (editId.value) {
    await api.put(`/alerts/rules/${editId.value}`, payload);
    ElMessage.success('已更新');
  } else {
    await api.post('/alerts/rules', payload);
    ElMessage.success('创建成功');
  }
  showRuleDialog.value = false;
  fetchRules();
}
async function toggleRule(rule: any) {
  await api.put(`/alerts/rules/${rule.id}`, { enabled: rule.enabled });
}
async function deleteRule(id: string) {
  await api.delete(`/alerts/rules/${id}`);
  ElMessage.success('已删除');
  fetchRules();
}

/* ---------- 通知渠道 ---------- */
const showChannelDialog = ref(false);
const channelEditId = ref<string | null>(null);

const CHANNEL_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  email: [
    { key: 'host', label: 'SMTP 主机', placeholder: 'smtp.example.com' },
    { key: 'port', label: '端口', placeholder: '默认 587' },
    { key: 'user', label: '用户名', placeholder: '登录账号' },
    { key: 'pass', label: '密码', placeholder: '授权码 / 密码' },
    { key: 'to', label: '收件人', placeholder: '逗号分隔多个' },
  ],
  telegram: [
    { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC...' },
    { key: 'chatId', label: 'Chat ID', placeholder: '目标会话 ID' },
  ],
  wechat_work: [
    { key: 'webhookUrl', label: 'Webhook', placeholder: '机器人 Webhook 地址' },
  ],
  webhook: [
    { key: 'url', label: 'URL', placeholder: 'POST 目标地址' },
  ],
};
function channelFields(type: string) {
  return CHANNEL_FIELDS[type] || [];
}
function channelTypeLabel(t: string) {
  return { email: '邮件', telegram: 'Telegram', wechat_work: '企业微信', webhook: 'Webhook' }[t] || t;
}
function configSummary(row: Channel) {
  const c = row.config || {};
  if (row.type === 'email') return c.to || c.host || '—';
  if (row.type === 'telegram') return c.chatId || '—';
  if (row.type === 'wechat_work') return c.webhookUrl || '—';
  if (row.type === 'webhook') return c.url || '—';
  return '—';
}

function emptyChannelForm() {
  return { name: '', type: 'email', config: {} as Record<string, string> };
}
const channelForm = reactive(emptyChannelForm());

function onChannelTypeChange() {
  channelForm.config = {};
}
function openChannelCreate() {
  channelEditId.value = null;
  Object.assign(channelForm, emptyChannelForm());
  showChannelDialog.value = true;
}
function openChannelEdit(row: Channel) {
  channelEditId.value = row.id;
  Object.assign(channelForm, { name: row.name, type: row.type, config: { ...row.config } });
  showChannelDialog.value = true;
}
async function submitChannel() {
  if (!channelForm.name) { ElMessage.warning('请填写名称'); return; }
  const payload = { ...channelForm };
  if (channelEditId.value) {
    await api.put(`/notify-channels/${channelEditId.value}`, payload);
    ElMessage.success('已更新');
  } else {
    await api.post('/notify-channels', payload);
    ElMessage.success('创建成功');
  }
  showChannelDialog.value = false;
  fetchChannels();
}
async function toggleChannel(row: Channel) {
  await api.put(`/notify-channels/${row.id}`, { enabled: row.enabled });
}
async function deleteChannel(id: string) {
  await api.delete(`/notify-channels/${id}`);
  ElMessage.success('已删除');
  fetchChannels();
}

/* ---------- 加载 ---------- */
async function fetchRules() {
  loading.value = true;
  const { data } = await api.get('/alerts/rules');
  rules.value = data;
  loading.value = false;
}
async function fetchEvents() {
  const { data } = await api.get('/alerts/events', {
    params: { page: eventsPage.value, pageSize: eventsPageSize.value },
  });
  events.value = data.rows;
  eventsTotal.value = data.total;
}
function onEventsPageChange(page: number) {
  eventsPage.value = page;
  fetchEvents();
}
async function fetchChannels() {
  channelLoading.value = true;
  const { data } = await api.get('/notify-channels');
  channels.value = data;
  channelLoading.value = false;
}

onMounted(async () => {
  await fetchChannels();
  await fetchRules();
  await fetchEvents();
  const { data } = await api.get('/groups');
  groups.value = data;
});
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.page-head { display: flex; align-items: center; justify-content: space-between; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--text-1); }
.tabs-wrap { padding: 8px 16px 16px; }
.tab-toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.panel { padding: 18px 20px; }
.panel-head { margin-bottom: 14px; }
.panel-head h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-1); }
.pager { margin-top: 14px; display: flex; justify-content: flex-end; }
</style>
