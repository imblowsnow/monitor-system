<template>
  <div class="admin-shell" :class="{ collapsed }">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="side-brand">
        <div class="brand-mark"><el-icon :size="20"><Monitor /></el-icon></div>
        <span v-show="!collapsed" class="brand-name">Monitor</span>
      </div>

      <nav class="side-nav">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item) }"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span v-show="!collapsed" class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="side-foot">
        <router-link to="/" class="nav-item" target="_blank">
          <el-icon :size="18"><View /></el-icon>
          <span v-show="!collapsed" class="nav-label">查看状态页</span>
        </router-link>
      </div>
    </aside>

    <!-- 右侧 -->
    <div class="main-area">
      <header class="topbar">
        <button class="collapse-btn" @click="collapsed = !collapsed">
          <el-icon :size="18"><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
        </button>

        <div class="page-title">{{ currentTitle }}</div>

        <div class="top-actions">
          <span class="ws-status" :class="{ on: wsStore.connected }">
            <span class="status-dot" :class="wsStore.connected ? 'online' : 'offline'" />
            {{ wsStore.connected ? '实时已连接' : '连接断开' }}
          </span>
          <ThemeToggle />
          <el-dropdown @command="onCommand">
            <span class="user-chip">
              <el-icon :size="16"><UserFilled /></el-icon>
              <span>管理员</span>
              <el-icon :size="12"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Monitor, Platform, Promotion, Timer, Bell, Folder, Setting,
  Connection, View, Fold, Expand, UserFilled, ArrowDown,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { useWsStore } from '../stores/websocket';
import { useClientsStore } from '../stores/clients';
import ThemeToggle from '../components/ThemeToggle.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const wsStore = useWsStore();
const clientsStore = useClientsStore();

const collapsed = ref(localStorage.getItem('sidebar-collapsed') === '1');

const navItems = [
  { to: '/admin', label: '总览', icon: Monitor, exact: true },
  { to: '/admin/commands', label: '命令执行', icon: Promotion },
  { to: '/admin/tasks', label: '定时任务', icon: Timer },
  { to: '/admin/alerts', label: '告警', icon: Bell },
  { to: '/admin/netnodes', label: '测速节点', icon: Connection },
  { to: '/admin/files', label: '文件管理', icon: Folder },
  { to: '/admin/settings', label: '设置', icon: Setting },
];

function isActive(item: { to: string; exact?: boolean }) {
  if (item.exact) return route.path === item.to;
  return route.path.startsWith(item.to);
}

const currentTitle = computed(() => {
  const found = navItems.find(i => isActive(i));
  if (route.name === 'ClientDetail') return '节点详情';
  return found?.label || '总览';
});

function onCommand(cmd: string) {
  if (cmd === 'logout') handleLogout();
}

function handleLogout() {
  authStore.logout();
  wsStore.disconnect();
  router.push('/admin/login');
}

onMounted(() => {
  wsStore.connect();
  clientsStore.fetchClients();
});

onUnmounted(() => {
  wsStore.disconnect();
});

// 持久化折叠状态
watch(collapsed, (v) => localStorage.setItem('sidebar-collapsed', v ? '1' : '0'));
</script>

<style scoped>
.admin-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* 侧边栏 */
.sidebar {
  width: 232px;
  flex-shrink: 0;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
}
.collapsed .sidebar {
  width: 72px;
}
.side-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 60px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
}
.brand-mark {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-1);
  white-space: nowrap;
}
.side-nav {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--sidebar-text);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}
.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-1);
}
.nav-item.active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
}
.collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}
.side-foot {
  padding: 12px;
  border-top: 1px solid var(--border);
}

/* 主区 */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.topbar {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 22px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}
.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background 0.15s ease;
}
.collapse-btn:hover {
  background: var(--bg-hover);
  color: var(--text-1);
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-1);
}
.top-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}
.ws-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text-2);
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--bg-inset);
}
.ws-status .status-dot {
  box-shadow: none;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--text-1);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  outline: none;
  transition: background 0.15s ease;
}
.user-chip:hover {
  background: var(--bg-hover);
}
.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-body);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
