<template>
  <div class="page">
    <div class="page-head">
      <h2>设置</h2>
    </div>

    <div class="surface panel">
      <div class="panel-head"><h3>系统状态</h3></div>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">实时连接</span>
          <span class="info-value">
            <span class="status-dot" :class="wsStore.connected ? 'online' : 'offline'" />
            {{ wsStore.connected ? '已连接' : '断开' }}
          </span>
        </div>
        <div class="info-item">
          <span class="info-label">在线节点</span>
          <span class="info-value">{{ clientsStore.onlineCount }} / {{ clientsStore.clients.length }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">离线节点</span>
          <span class="info-value">{{ clientsStore.offlineCount }}</span>
        </div>
      </div>
    </div>

    <div class="surface panel">
      <div class="panel-head"><h3>外观</h3></div>
      <div class="info-item">
        <span class="info-label">主题模式</span>
        <el-radio-group :model-value="theme.mode" @change="(v: any) => theme.setMode(v)">
          <el-radio-button value="light">亮色</el-radio-button>
          <el-radio-button value="dark">深色</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="surface panel">
      <div class="panel-head"><h3>IP 归属地解析</h3></div>
      <el-form :model="geoForm" label-width="120px" v-loading="geoLoading" class="geo-form">
        <el-form-item label="查询接口地址">
          <el-input v-model="geoForm['geo.api.url']" placeholder="http://ip-api.com/json/{ip}?fields=status,countryCode,country&lang=zh-CN" />
          <div class="form-tip">用 <code>{ip}</code> 作为 IP 占位符，注册时会被替换为节点真实 IP。</div>
        </el-form-item>
        <el-form-item label="国家码字段">
          <el-input v-model="geoForm['geo.field.country']" placeholder="countryCode" />
          <div class="form-tip">返回 JSON 中国家码（ISO alpha-2）的字段路径，支持点路径，如 <code>countryCode</code> 或 <code>data.country_code</code>。</div>
        </el-form-item>
        <el-form-item label="国家名字段">
          <el-input v-model="geoForm['geo.field.countryName']" placeholder="country" />
          <div class="form-tip">国家名称字段路径，如 <code>country</code> 或 <code>data.country</code>。</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="geoSaving" @click="saveGeo">保存</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="surface panel">
      <div class="panel-head"><h3>日志清理</h3></div>
      <el-form :model="cleanupForm" label-width="120px" v-loading="cleanupLoading" class="geo-form">
        <el-form-item label="定时清理">
          <el-switch v-model="cleanupForm.enabled" />
          <div class="form-tip">开启后按下方计划自动清理历史数据。</div>
        </el-form-item>
        <el-form-item label="定时计划">
          <el-input v-model="cleanupForm.cron" placeholder="0 4 * * *" :disabled="!cleanupForm.enabled" />
          <div class="form-tip">标准 cron 表达式，默认 <code>0 4 * * *</code>（每天凌晨 4 点）。</div>
        </el-form-item>
        <el-form-item label="数据保留">
          <el-input-number v-model="cleanupForm.days" :min="0" :step="1" />
          <span class="unit">天</span>
          <div class="form-tip">清理多少天前的指标数据和状态数据，<code>0</code> 表示不清理。</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="cleanupSaving" @click="saveCleanup">保存</el-button>
          <el-button :loading="cleanupRunning" @click="runCleanup">立即清理</el-button>
          <el-button :loading="aggregateRunning" @click="runAggregate">立即聚合</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useWsStore } from '../stores/websocket';
import { useClientsStore } from '../stores/clients';
import { useThemeStore } from '../stores/theme';
import api from '../api/index';

const wsStore = useWsStore();
const clientsStore = useClientsStore();
const theme = useThemeStore();

const geoForm = ref<Record<string, string>>({
  'geo.api.url': '',
  'geo.field.country': '',
  'geo.field.countryName': '',
});
const geoLoading = ref(false);
const geoSaving = ref(false);

const cleanupForm = ref({
  enabled: false,
  cron: '0 4 * * *',
  days: 30,
  aggregateEnabled: false,
  aggregateAfterDays: 1,
});
const cleanupLoading = ref(false);
const cleanupSaving = ref(false);
const cleanupRunning = ref(false);
const aggregateRunning = ref(false);

onMounted(async () => {
  geoLoading.value = true;
  cleanupLoading.value = true;
  try {
    const { data } = await api.get('/system-config');
    for (const k of Object.keys(geoForm.value)) {
      if (data[k] != null) geoForm.value[k] = data[k];
    }
    if (data['cleanup.enabled'] != null) cleanupForm.value.enabled = data['cleanup.enabled'] === 'true';
    if (data['cleanup.cron']) cleanupForm.value.cron = data['cleanup.cron'];
    if (data['cleanup.days'] != null) cleanupForm.value.days = Number(data['cleanup.days']) || 0;
    if (data['cleanup.aggregateEnabled'] != null) cleanupForm.value.aggregateEnabled = data['cleanup.aggregateEnabled'] === 'true';
    if (data['cleanup.aggregateAfterDays'] != null) cleanupForm.value.aggregateAfterDays = Number(data['cleanup.aggregateAfterDays']) || 1;
  } finally {
    geoLoading.value = false;
    cleanupLoading.value = false;
  }
});

async function saveGeo() {
  geoSaving.value = true;
  try {
    await api.put('/system-config', geoForm.value);
    ElMessage.success('已保存');
  } catch {
    ElMessage.error('保存失败');
  } finally {
    geoSaving.value = false;
  }
}

async function saveCleanup() {
  cleanupSaving.value = true;
  try {
    await api.put('/system-config', {
      'cleanup.enabled': String(cleanupForm.value.enabled),
      'cleanup.cron': cleanupForm.value.cron,
      'cleanup.days': String(cleanupForm.value.days),
      'cleanup.aggregateEnabled': String(cleanupForm.value.aggregateEnabled),
      'cleanup.aggregateAfterDays': String(cleanupForm.value.aggregateAfterDays),
    });
    ElMessage.success('已保存');
  } catch {
    ElMessage.error('保存失败');
  } finally {
    cleanupSaving.value = false;
  }
}

async function runCleanup() {
  cleanupRunning.value = true;
  try {
    const { data } = await api.post('/system-config/cleanup/run');
    ElMessage.success(`清理完成：聚合 ${data.aggregatedRows} 条（删原始 ${data.aggregateDeleted} 条），过期删除指标 ${data.metricDeleted} 条，状态 ${data.statusDeleted} 条`);
  } catch {
    ElMessage.error('清理失败');
  } finally {
    cleanupRunning.value = false;
  }
}

async function runAggregate() {
  aggregateRunning.value = true;
  try {
    const { data } = await api.post('/system-config/cleanup/aggregate');
    ElMessage.success(`聚合完成：生成 ${data.aggregatedRows} 条聚合行，删除原始 ${data.deletedRows} 条`);
  } catch {
    ElMessage.error('聚合失败');
  } finally {
    aggregateRunning.value = false;
  }
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--text-1); }
.panel { padding: 18px 20px; }
.panel-head { margin-bottom: 16px; }
.panel-head h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-1); }
.info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.info-item { display: flex; align-items: center; gap: 12px; }
.info-label { font-size: 13px; color: var(--text-3); min-width: 72px; }
.info-value { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; color: var(--text-1); font-weight: 500; }
.info-value .status-dot { box-shadow: none; }
.geo-form { max-width: 640px; }
.form-tip { font-size: 12px; color: var(--text-3); line-height: 1.6; margin-top: 4px; }
.form-tip code { padding: 1px 5px; border-radius: 4px; background: var(--fill-2, rgba(127,127,127,.15)); font-size: 12px; }
.unit { margin-left: 8px; font-size: 13px; color: var(--text-3); }
</style>
