import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function resolveInitial(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved === 'light' || saved === 'dark') return saved;
  // 默认亮色;若系统偏好深色则跟随
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(resolveInitial());

  function apply(m: ThemeMode) {
    document.documentElement.setAttribute('data-theme', m);
  }

  function toggle() {
    mode.value = mode.value === 'light' ? 'dark' : 'light';
  }

  function setMode(m: ThemeMode) {
    mode.value = m;
  }

  watch(
    mode,
    (m) => {
      apply(m);
      localStorage.setItem(STORAGE_KEY, m);
    },
    { immediate: true }
  );

  return { mode, toggle, setMode };
});
