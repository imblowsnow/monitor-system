<template>
  <div class="page">
    <div class="page-head">
      <h2>文件管理</h2>
    </div>

    <div class="surface panel">
      <div class="file-toolbar">
        <el-select v-model="selectedClient" placeholder="选择节点" class="f-client">
          <el-option v-for="c in onlineClients" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input v-model="currentPath" placeholder="路径" class="f-path" @keyup.enter="browse" />
        <el-button type="primary" @click="browse">浏览</el-button>
      </div>

      <el-table :data="files" v-loading="loading" style="margin-top: 16px">
        <el-table-column label="名称" min-width="220">
          <template #default="{ row }">
            <span class="file-name" :class="{ dir: row.isDir }" @click="row.isDir && navigateTo(row.name)">
              <el-icon><Folder v-if="row.isDir" /><Document v-else /></el-icon>
              {{ row.name }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="120">
          <template #default="{ row }">{{ row.isDir ? '-' : formatBytes(row.size) }}</template>
        </el-table-column>
        <el-table-column prop="modTime" label="修改时间" width="180" />
        <el-table-column prop="permissions" label="权限" width="120" />
      </el-table>
      <el-alert
        v-if="!selectedClient"
        type="info"
        :closable="false"
        title="选择在线节点并输入路径后点击浏览"
        style="margin-top: 12px"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Folder, Document } from '@element-plus/icons-vue';
import { useClientsStore } from '../stores/clients';
import { formatBytes } from '../utils/format';

const clientsStore = useClientsStore();
const selectedClient = ref('');
const currentPath = ref('/');
const files = ref<any[]>([]);
const loading = ref(false);

const onlineClients = computed(() => clientsStore.clients.filter(c => c.status === 'online'));

function browse() {
  if (!selectedClient.value) return;
  loading.value = true;
  // TODO: 通过 WS 实现文件浏览
  loading.value = false;
}
function navigateTo(name: string) {
  currentPath.value = currentPath.value.replace(/\/?$/, '/') + name;
  browse();
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--text-1); }
.panel { padding: 18px 20px; }
.file-toolbar { display: flex; gap: 12px; }
.f-client { width: 200px; }
.f-path { flex: 1; }
.file-name { display: inline-flex; align-items: center; gap: 6px; }
.file-name.dir { cursor: pointer; color: var(--brand); }
</style>
