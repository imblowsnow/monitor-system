<template>
  <div class="page">
    <div class="page-head">
      <h2>测速节点</h2>
      <el-button type="primary" :icon="Plus" @click="openCreate">添加测速节点</el-button>
    </div>

    <div class="surface table-wrap">
      <el-table :data="nodes" v-loading="loading">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="target" label="目标" min-width="180" show-overflow-tooltip />
        <el-table-column label="探测方式" width="120">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.probe }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="启用" width="80">
          <template #default="{ row }"><el-switch v-model="row.enabled" @change="toggleNode(row)" /></template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="deleteNode(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showDialog" :title="editing ? '编辑节点' : '添加节点'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="目标">
          <el-input v-model="form.target" placeholder="域名 / IP / URL" />
        </el-form-item>
        <el-form-item label="探测方式">
          <el-select v-model="form.probe" style="width: 100%">
            <el-option label="HTTP" value="http" />
            <el-option label="ICMP (Ping)" value="icmp" />
            <el-option label="TCP" value="tcp" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import api from '../api/index';

const nodes = ref<any[]>([]);
const loading = ref(false);
const showDialog = ref(false);
const editing = ref<string | null>(null);
const form = reactive({ name: '', target: '', probe: 'http', isp: '', enabled: true, sortOrder: 0 });

onMounted(fetchNodes);

async function fetchNodes() {
  loading.value = true;
  const { data } = await api.get('/netnodes');
  nodes.value = data;
  loading.value = false;
}

function reset() {
  Object.assign(form, { name: '', target: '', probe: 'http', isp: '', enabled: true, sortOrder: 0 });
}

function openCreate() {
  editing.value = null;
  reset();
  showDialog.value = true;
}

function openEdit(row: any) {
  editing.value = row.id;
  Object.assign(form, {
    name: row.name, target: row.target, probe: row.probe,
    isp: row.isp || '', enabled: row.enabled, sortOrder: row.sortOrder,
  });
  showDialog.value = true;
}

async function save() {
  if (!form.name || !form.target) {
    ElMessage.warning('名称和目标不能为空');
    return;
  }
  if (editing.value) {
    await api.put(`/netnodes/${editing.value}`, form);
    ElMessage.success('已保存');
  } else {
    await api.post('/netnodes', form);
    ElMessage.success('已添加');
  }
  showDialog.value = false;
  fetchNodes();
}

async function toggleNode(row: any) {
  await api.put(`/netnodes/${row.id}`, { enabled: row.enabled });
}

async function deleteNode(id: string) {
  await api.delete(`/netnodes/${id}`);
  ElMessage.success('已删除');
  fetchNodes();
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.page-head { display: flex; align-items: center; justify-content: space-between; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--text-1); }
.table-wrap { padding: 8px 12px; }
</style>
