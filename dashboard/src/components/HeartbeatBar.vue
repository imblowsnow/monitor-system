<template>
  <div class="hb-bar" :class="{ compact }">
    <div
      v-for="(b, i) in beats"
      :key="i"
      class="hb-beat"
      :class="b.status"
      :title="b.tooltip"
    />
  </div>
</template>

<script setup lang="ts">
import type { Beat } from '../utils/format';

defineProps<{
  beats: Beat[];
  compact?: boolean;
}>();
</script>

<style scoped>
.hb-bar {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 34px;
  width: 100%;
}
.hb-bar.compact {
  height: 22px;
  gap: 2px;
}
.hb-beat {
  flex: 1;
  min-width: 2px;
  height: 100%;
  border-radius: 3px;
  background: var(--c-empty);
  transition: transform 0.12s ease, filter 0.12s ease;
}
.hb-bar.compact .hb-beat {
  border-radius: 2px;
}
.hb-beat:hover {
  transform: scaleY(1.15);
  filter: brightness(1.1);
}
.hb-beat.online {
  background: var(--c-up);
}
.hb-beat.warning {
  background: var(--c-warn);
}
.hb-beat.offline {
  background: var(--c-down);
}
.hb-beat.empty {
  background: var(--c-empty);
}
</style>
