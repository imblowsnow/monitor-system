<template>
  <div class="public-page">
    <header class="pub-header">
      <div class="pub-header-inner">
        <router-link to="/" class="back">
          <el-icon :size="18"><ArrowLeft /></el-icon>
          <span>返回</span>
        </router-link>
        <ThemeToggle />
      </div>
    </header>

    <main v-loading="loading" class="pub-main">
      <template v-if="detail">
        <!-- 标题区 -->
        <section class="detail-head">
          <span class="status-dot lg" :class="[detail.status, { pulse: detail.status === 'online' }]" />
          <div class="dh-text">
            <h1>{{ detail.name }}</h1>
            <div class="dh-meta">
              <span class="dh-status" :class="detail.status">{{ statusLabel(detail.status) }}</span>
              <span class="dot-sep">·</span>
              <span>{{ detail.group }}</span>
            </div>
          </div>
        </section>

        <!-- 可用率三档 -->
        <section class="uptime-cards">
          <div class="uc">
            <div class="uc-num" :class="uptimeClass(detail.uptime.day)">{{ detail.uptime.day }}%</div>
            <div class="uc-label">24 小时</div>
          </div>
          <div class="uc">
            <div class="uc-num" :class="uptimeClass(detail.uptime.week)">{{ detail.uptime.week }}%</div>
            <div class="uc-label">7 天</div>
          </div>
          <div class="uc">
            <div class="uc-num" :class="uptimeClass(detail.uptime.month)">{{ detail.uptime.month }}%</div>
            <div class="uc-label">30 天</div>
          </div>
        </section>

        <!-- 时间线 -->
        <section class="timeline-card">
          <div class="tc-head">
            <h2>可用性时间线</h2>
            <el-radio-group v-model="rangeHours" size="small" @change="load">
              <el-radio-button :value="24">24h</el-radio-button>
              <el-radio-button :value="168">7天</el-radio-button>
              <el-radio-button :value="720">30天</el-radio-button>
            </el-radio-group>
          </div>
          <HeartbeatBar :beats="beats" />
          <div class="tc-foot">
            <span>{{ rangeLabel }}前</span>
            <span>现在</span>
          </div>
          <div class="legend">
            <span class="lg-item"><i class="status-dot online" />在线</span>
            <span class="lg-item"><i class="status-dot warning" />异常</span>
            <span class="lg-item"><i class="status-dot offline" />离线</span>
          </div>
        </section>
      </template>

      <el-empty v-else-if="!loading" description="服务不存在" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import ThemeToggle from '../../components/ThemeToggle.vue';
import HeartbeatBar from '../../components/HeartbeatBar.vue';
import { fetchPublicServer, type PublicServerDetail } from '../../api/public';
import { buildBeats, statusLabel } from '../../utils/format';

const route = useRoute();
const detail = ref<PublicServerDetail | null>(null);
const loading = ref(false);
const rangeHours = ref(24);
let timer: ReturnType<typeof setInterval> | null = null;

const beats = computed(() => {
  if (!detail.value) return [];
  const count = rangeHours.value <= 24 ? 48 : rangeHours.value <= 168 ? 56 : 60;
  return buildBeats(detail.value.timeline || [], count, rangeHours.value);
});

const rangeLabel = computed(() => {
  if (rangeHours.value <= 24) return '24 小时';
  if (rangeHours.value <= 168) return '7 天';
  return '30 天';
});

function uptimeClass(v: number) {
  if (v >= 99) return 'online';
  if (v >= 90) return 'warning';
  return 'offline';
}

async function load() {
  try {
    detail.value = await fetchPublicServer(route.params.id as string, rangeHours.value);
  } catch {
    detail.value = null;
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
  background: var(--bg-body);
}
.pub-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}
.pub-header-inner {
  max-width: 880px;
  margin: 0 auto;
  height: 60px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.back {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.18s ease;
}
.back:hover {
  color: var(--brand);
}
.pub-main {
  max-width: 880px;
  margin: 0 auto;
  padding: 28px 20px 48px;
}

/* 标题 */
.detail-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.status-dot.lg {
  width: 16px;
  height: 16px;
}
.dh-text h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-1);
}
.dh-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-2);
}
.dh-status.online {
  color: var(--c-up);
}
.dh-status.warning {
  color: var(--c-warn);
}
.dh-status.offline {
  color: var(--c-down);
}
.dot-sep {
  color: var(--text-3);
}

/* 可用率卡片 */
.uptime-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}
.uc {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  text-align: center;
  box-shadow: var(--shadow-sm);
}
.uc-num {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
}
.uc-num.online {
  color: var(--c-up);
}
.uc-num.warning {
  color: var(--c-warn);
}
.uc-num.offline {
  color: var(--c-down);
}
.uc-label {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-3);
}

/* 时间线 */
.timeline-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px 24px;
  box-shadow: var(--shadow-sm);
}
.tc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.tc-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
}
.tc-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-3);
}
.legend {
  display: flex;
  gap: 18px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.lg-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.lg-item .status-dot {
  box-shadow: none;
}

@media (max-width: 600px) {
  .uptime-cards {
    grid-template-columns: 1fr;
  }
}
</style>
