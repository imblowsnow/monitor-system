<template>
  <div class="page">
    <div class="page-head">
      <h2>定时任务</h2>
      <el-button type="primary" :icon="Plus" @click="openCreate">创建任务</el-button>
    </div>

    <div class="surface table-wrap">
      <el-table :data="tasks" v-loading="loading">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="cronExpression" label="Cron 表达式" width="160" />
        <el-table-column prop="command" label="命令" min-width="180" show-overflow-tooltip />
        <el-table-column label="目标" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="g in (row.targetGroups || [])" :key="'g-' + g" size="small" type="warning" style="margin: 0 4px 2px 0">组:{{ g }}</el-tag>
            <el-tag v-for="cid in (row.targetClients || [])" :key="'c-' + cid" size="small" style="margin: 0 4px 2px 0">{{ clientName(cid) }}</el-tag>
            <span v-if="!(row.targetGroups || []).length && !(row.targetClients || []).length" class="muted">全部</span>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" @change="toggleTask(row)" />
          </template>
        </el-table-column>
        <el-table-column label="最近执行" width="170">
          <template #default="{ row }">
            <span v-if="row.lastRunAt">{{ formatTime(row.lastRunAt) }}</span>
            <span v-else class="muted">未执行</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain :loading="runningId === row.id" @click="runTask(row)">立即执行</el-button>
            <el-button size="small" plain @click="openEdit(row)">编辑</el-button>
            <el-button size="small" plain @click="openLogs(row)">记录</el-button>
            <el-button size="small" type="danger" plain @click="deleteTask(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="showLogs" :title="`执行记录 - ${currentTask?.name || ''}`" size="640px">
      <el-table :data="logs" v-loading="logsLoading" size="small">
        <el-table-column prop="clientName" label="节点" min-width="120" show-overflow-tooltip />
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.executedAt) }}</template>
        </el-table-column>
        <el-table-column label="退出码" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.exitCode === 0 ? 'success' : row.exitCode === null ? 'info' : 'danger'">
              {{ row.exitCode ?? 'pending' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column type="expand">
          <template #default="{ row }">
            <pre class="log-output">{{ row.stdout || row.stderr || '(无输出)' }}</pre>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!logsLoading && !logs.length" description="暂无执行记录" />
    </el-drawer>

    <el-dialog v-model="showDialog" :title="form.id ? '编辑定时任务' : '创建定时任务'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="Cron 表达式"><el-input v-model="form.cronExpression" placeholder="0 3 * * *" /></el-form-item>
        <el-form-item label="命令"><el-input v-model="form.command" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="目标分组">
          <el-select v-model="form.targetGroups" multiple placeholder="留空表示全部" style="width: 100%">
            <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标节点">
          <el-select v-model="form.targetClients" multiple filterable placeholder="可单独指定节点" style="width: 100%" collapse-tags collapse-tags-tooltip>
            <el-option v-for="c in clients" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <div class="form-hint">分组与节点会合并去重;两者都留空表示对全部节点执行。</div>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="saveTask">{{ form.id ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import api from '../api/index';
import { formatTime } from '../utils/format';
import { useClientsStore } from '../stores/clients';

const clientsStore = useClientsStore();
const clients = computed(() => clientsStore.clients);

const tasks = ref<any[]>([]);
const groups = ref<string[]>([]);
const loading = ref(false);
const runningId = ref<string>('');
const showDialog = ref(false);
const form = reactive({
  id: '',
  name: '',
  cronExpression: '',
  command: '',
  targetGroups: [] as string[],
  targetClients: [] as string[],
});

const showLogs = ref(false);
const logs = ref<any[]>([]);
const logsLoading = ref(false);
const currentTask = ref<any>(null);

function clientName(id: string) {
  return clientsStore.clients.find(c => c.id === id)?.name || id;
}

onMounted(async () => {
  if (!clientsStore.clients.length) clientsStore.fetchClients();
  await fetchTasks();
  const { data } = await api.get('/groups');
  groups.value = data;
});

async function fetchTasks() {
  loading.value = true;
  const { data } = await api.get('/tasks');
  tasks.value = data;
  loading.value = false;
}

function resetForm() {
  form.id = '';
  form.name = '';
  form.cronExpression = '';
  form.command = '';
  form.targetGroups = [];
  form.targetClients = [];
}

function openCreate() {
  resetForm();
  showDialog.value = true;
}

function openEdit(task: any) {
  form.id = task.id;
  form.name = task.name;
  form.cronExpression = task.cronExpression;
  form.command = task.command;
  form.targetGroups = [...(task.targetGroups || [])];
  form.targetClients = [...(task.targetClients || [])];
  showDialog.value = true;
}

async function saveTask() {
  const payload = {
    name: form.name,
    cronExpression: form.cronExpression,
    command: form.command,
    targetGroups: form.targetGroups,
    targetClients: form.targetClients,
  };
  if (form.id) {
    await api.put(`/tasks/${form.id}`, payload);
    ElMessage.success('已保存');
  } else {
    await api.post('/tasks', payload);
    ElMessage.success('创建成功');
  }
  showDialog.value = false;
  fetchTasks();
}

async function runTask(task: any) {
  runningId.value = task.id;
  try {
    const { data } = await api.post(`/tasks/${task.id}/run`);
    ElMessage.success(`已下发到 ${data.sent} 个在线节点`);
    fetchTasks();
  } finally {
    runningId.value = '';
  }
}

async function toggleTask(task: any) {
  await api.put(`/tasks/${task.id}`, { enabled: task.enabled });
}
async function deleteTask(id: string) {
  await api.delete(`/tasks/${id}`);
  ElMessage.success('已删除');
  fetchTasks();
}

async function openLogs(task: any) {
  currentTask.value = task;
  showLogs.value = true;
  logsLoading.value = true;
  try {
    const { data } = await api.get(`/tasks/${task.id}/logs`);
    logs.value = data;
  } finally {
    logsLoading.value = false;
  }
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--text-1); }
.table-wrap { padding: 8px 12px; }
.muted { color: var(--text-3); }
.form-hint { font-size: 12px; color: var(--text-3); padding-left: 100px; margin-top: -8px; }
.log-output {
  margin: 0;
  background: var(--bg-inset);
  color: var(--text-1);
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-size: 13px;
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
