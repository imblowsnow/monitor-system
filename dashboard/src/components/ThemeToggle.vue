<template>
  <button class="theme-toggle" :title="label" @click="theme.toggle()">
    <el-icon :size="18">
      <Moon v-if="theme.mode === 'light'" />
      <Sunny v-else />
    </el-icon>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Moon, Sunny } from '@element-plus/icons-vue';
import { useThemeStore } from '../stores/theme';

const theme = useThemeStore();
const label = computed(() => (theme.mode === 'light' ? '切换深色' : '切换亮色'));
</script>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-2);
  cursor: pointer;
  transition: all 0.18s ease;
}
.theme-toggle:hover {
  color: var(--brand);
  border-color: var(--brand);
  background: var(--brand-soft);
}
</style>
