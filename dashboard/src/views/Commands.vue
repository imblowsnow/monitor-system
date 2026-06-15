<template>
  <div class="page">
    <div class="page-head">
      <h2>命令执行</h2>
    </div>

    <div class="surface panel">
      <el-form @submit.prevent="runCommand">
        <div class="cmd-row">
          <el-radio-group v-model="mode" class="cmd-mode">
            <el-radio-button value="node">按节点</el-radio-button>
            <el-radio-button value="group">按分组</el-radio-button>
          </el-radio-group>
          <el-select
            v-if="mode === 'node'"
            v-model="selectedClients"
            multiple
            placeholder="选择节点"
            class="cmd-targets"
            collapse-tags
            collapse-tags-tooltip
          >
            <el-option v-for="c in onlineClients" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-select
            v-else
            v-model="selectedGroups"
            multiple
            placeholder="选择分组"
            class="cmd-targets"
            collapse-tags
            collapse-tags-tooltip
          >
            <el-option v-for="g in groups" :key="g" :label="`${g} (${groupOnlineCount(g)} 在线)`" :value="g" />
          </el-select>
          <el-input v-model="command" placeholder="输入要执行的命令" class="cmd-input" @keyup.enter="runCommand" />
          <el-button type="primary" :icon="Promotion" @click="runCommand" :loading="running">执行</el-button>
        </div>
      </el-form>
    </div>

    <div v-if="results.length" class="results">
      <div v-for="result in results" :key="result.clientId + result.time" class="surface result-item">
        <div class="result-head">
          <span class="status-dot online" />
          <strong>{{ getClientName(result.clientId) }}</strong>
          <el-tag size="small" :type="result.exitCode === 0 ? 'success' : result.exitCode === null ? 'info' : 'danger'">
            exit: {{ result.exitCode ?? 'pending' }}
          </el-tag>
          <span class="result-time">{{ formatTime(result.time) }}</span>
        </div>
        <pre class="result-output">{{ result.stdout || result.stderr || '(无输出)' }}</pre>
      </div>
    </div>
    <el-empty v-else description="暂无执行记录" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Promotion } from '@element-plus/icons-vue';
import { useClientsStore } from '../stores/clients';
import { useWsStore } from '../stores/websocket';
import api from '../api/index';
import { formatTime } from '../utils/format';

const clientsStore = useClientsStore();
const wsStore = useWsStore();
const mode = ref<'node' | 'group'>('node');
const selectedClients = ref<string[]>([]);
const selectedGroups = ref<string[]>([]);
const command = ref('');
const running = ref(false);
const results = ref<Array<{ clientId: string; exitCode: number | null; stdout: string; stderr: string; time: string }>>([]);

const onlineClients = computed(() => clientsStore.clients.filter(c => c.status === 'online'));
const groups = computed(() => [...new Set(clientsStore.clients.map(c => c.groupName))]);

function groupOnlineCount(group: string) {
  return onlineClients.value.filter(c => c.groupName === group).length;
}

function getClientName(id: string) {
  return clientsStore.clients.find(c => c.id === id)?.name || id;
}

/** 根据当前模式解析出目标节点 id 列表(仅在线节点)。 */
function resolveTargets(): string[] {
  if (mode.value === 'node') return selectedClients.value;
  return onlineClients.value
    .filter(c => selectedGroups.value.includes(c.groupName))
    .map(c => c.id);
}

async function runCommand() {
  const targets = resolveTargets();
  if (!command.value || targets.length === 0) {
    ElMessage.warning('请选择目标并输入命令');
    return;
  }
  running.value = true;
  for (const clientId of targets) {
    try {
      const { data } = await api.post(`/clients/${clientId}/command`, { command: command.value, timeout: 30000 });
      results.value.unshift({ clientId, exitCode: null, stdout: '', stderr: '', time: new Date().toISOString() });
      const entry = results.value[0];
      wsStore.onCommand(data.msgId, (payload) => {
        entry.exitCode = payload.exitCode;
        entry.stdout = payload.stdout || '';
        entry.stderr = payload.stderr || '';
      });
    } catch {
      results.value.unshift({ clientId, exitCode: -1, stdout: '', stderr: 'Agent 离线或请求失败', time: new Date().toISOString() });
    }
  }
  running.value = false;
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--text-1); }
.panel { padding: 18px 20px; }
.cmd-row { display: flex; gap: 12px; }
.cmd-mode { flex-shrink: 0; }
.cmd-targets { width: 260px; flex-shrink: 0; }
.cmd-input { flex: 1; }
.results { display: flex; flex-direction: column; gap: 12px; }
.result-item { padding: 14px 18px; }
.result-head { display: flex; align-items: center; gap: 10px; }
.result-head .status-dot { box-shadow: none; }
.result-head strong { color: var(--text-1); }
.result-time { margin-left: auto; font-size: 12px; color: var(--text-3); }
.result-output {
  margin: 10px 0 0;
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
