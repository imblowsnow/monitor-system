<template>
  <div class="page">
    <div class="page-head">
      <h2>Web 终端</h2>
      <div class="head-actions">
        <el-select v-model="selectedClient" placeholder="选择节点" class="term-select">
          <el-option v-for="c in onlineClients" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-button type="primary" @click="openSession" :disabled="!selectedClient">连接</el-button>
        <el-button type="danger" plain @click="closeSession" :disabled="!sessionId">断开</el-button>
      </div>
    </div>

    <div class="surface term-wrap">
      <div ref="terminalRef" class="term-host"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useClientsStore } from '../stores/clients';
import { useWsStore } from '../stores/websocket';

const route = useRoute();
const clientsStore = useClientsStore();
const wsStore = useWsStore();
const terminalRef = ref<HTMLElement>();
const selectedClient = ref(route.query.clientId as string || '');
const sessionId = ref('');
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let unsubscribe: (() => void) | null = null;
let stopAutoConnectWatch: (() => void) | null = null;

const onlineClients = computed(() => clientsStore.clients.filter(c => c.status === 'online'));

onMounted(() => {
  term = new Terminal({
    fontSize: 13,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff' },
    cursorBlink: true,
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  if (terminalRef.value) {
    term.open(terminalRef.value);
    fitAddon.fit();
  }

  term.onData((data) => {
    if (sessionId.value) {
      wsStore.send({ type: 'terminal_data', payload: { sessionId: sessionId.value, data: encodeBase64(data) } });
    }
  });

  term.onResize(({ cols, rows }) => {
    if (sessionId.value) {
      wsStore.send({ type: 'terminal_resize', payload: { sessionId: sessionId.value, cols, rows } });
    }
  });

  unsubscribe = wsStore.onTerminal((msg) => {
    switch (msg.type) {
      case 'terminal_opened':
        if (msg.payload.success) {
          sessionId.value = msg.payload.sessionId;
          term?.write('\x1b[32mConnected.\x1b[0m\r\n');
          term?.focus();
        } else {
          term?.write('\x1b[31mFailed to open terminal.\x1b[0m\r\n');
        }
        break;
      case 'terminal_data':
        if (msg.payload.sessionId === sessionId.value) term?.write(decodeBase64(msg.payload.data));
        break;
      case 'terminal_close':
        if (msg.payload.sessionId === sessionId.value) {
          term?.write(`\r\n\x1b[33mDisconnected (${msg.payload.reason || 'closed'}).\x1b[0m\r\n`);
          sessionId.value = '';
        }
        break;
    }
  });

  window.addEventListener('resize', handleResize);

  // 携带 clientId 进入时自动建立连接（等待 WebSocket 就绪）
  if (selectedClient.value) {
    if (wsStore.connected) {
      autoConnect();
    } else {
      stopAutoConnectWatch = watch(
        () => wsStore.connected,
        (ready) => {
          if (ready) {
            autoConnect();
            stopAutoConnectWatch?.();
            stopAutoConnectWatch = null;
          }
        }
      );
    }
  }
});

onUnmounted(() => {
  stopAutoConnectWatch?.();
  closeSession();
  unsubscribe?.();
  term?.dispose();
  window.removeEventListener('resize', handleResize);
});

function encodeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function handleResize() {
  fitAddon?.fit();
}
function openSession() {
  if (!selectedClient.value || !term) return;
  const cols = term.cols;
  const rows = term.rows;
  term.clear();
  term.write('\x1b[33mConnecting...\x1b[0m\r\n');
  wsStore.send({ type: 'terminal_open', payload: { clientId: selectedClient.value, cols, rows } });
}
function autoConnect() {
  if (sessionId.value) return;
  openSession();
}
function closeSession() {
  if (sessionId.value) {
    wsStore.send({ type: 'terminal_close', payload: { sessionId: sessionId.value } });
    sessionId.value = '';
    term?.write('\r\n\x1b[33mDisconnected.\x1b[0m\r\n');
  }
}
</script>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; height: 100%; }
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.page-head h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--text-1); }
.head-actions { display: flex; gap: 10px; }
.term-select { width: 220px; }
.term-wrap {
  flex: 1;
  padding: 14px;
  background: #0d1117;
  border-color: #1f2733;
  min-height: 480px;
}
.term-host { height: 100%; min-height: 460px; }
</style>
