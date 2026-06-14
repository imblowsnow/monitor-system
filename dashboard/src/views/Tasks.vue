<template>
  <div class="page">
    <div class="page-head">
      <h2>定时任务</h2>
      <el-button type="primary" :icon="Plus" @click="showDialog = true">创建任务</el-button>
    </div>

    <div class="surface table-wrap">
      <el-table :data="tasks" v-loading="loading">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="cronExpression" label="Cron 表达式" width="160" />
        <el-table-column prop="command" label="命令" min-width="180" show-overflow-tooltip />
        <el-table-column label="目标分组" min-width="140">
          <template #default="{ row }">
            <el-tag v-for="g in (row.targetGroups || [])" :key="g" size="small" style="margin-right: 4px">{{ g }}</el-tag>
            <span v-if="!(row.targetGroups || []).length" class="muted">全部</span>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" @change="toggleTask(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" plain @click="deleteTask(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showDialog" title="创建定时任务" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="Cron 表达式"><el-input v-model="form.cronExpression" placeholder="0 3 * * *" /></el-form-item>
        <el-form-item label="命令"><el-input v-model="form.command" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="目标分组">
          <el-select v-model="form.targetGroups" multiple placeholder="留空表示全部" style="width: 100%">
            <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="createTask">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import api from '../api/index';

const tasks = ref<any[]>([]);
const groups = ref<string[]>([]);
const loading = ref(false);
const showDialog = ref(false);
const form = reactive({ name: '', cronExpression: '', command: '', targetGroups: [] as string[] });

onMounted(async () => {
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
async function createTask() {
  await api.post('/tasks', form);
  ElMessage.success('创建成功');
  showDialog.value = false;
  fetchTasks();
}
async function toggleTask(task: any) {
  await api.put(`/tasks/${task.id}`, { enabled: task.enabled });
}
async function deleteTask(id: string) {
  await api.delete(`/tasks/${id}`);
  ElMessage.success('已删除');
  fetchTasks();
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
</style>
