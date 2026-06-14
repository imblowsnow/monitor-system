import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useClientsStore } from './clients';

export const useWsStore = defineStore('websocket', () => {
  const ws = ref<WebSocket | null>(null);
  const connected = ref(false);
  const metricsListeners = new Map<string, Array<(data: any) => void>>();
  const statusListeners = new Map<string, Array<(status: string) => void>>();
  const commandListeners = new Map<string, Array<(data: any) => void>>();
  const terminalListeners: Array<(msg: any) => void> = [];

  function connect() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/dashboard?token=${token}`;
    const socket = new WebSocket(url);

    socket.onopen = () => {
      connected.value = true;
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    };

    socket.onclose = () => {
      connected.value = false;
      setTimeout(() => connect(), 3000);
    };

    ws.value = socket;
  }

  function handleMessage(msg: any) {
    const clientsStore = useClientsStore();

    switch (msg.type) {
      case 'init':
        break;
      case 'client_status':
        clientsStore.updateStatus(msg.payload.clientId, msg.payload.status);
        (statusListeners.get(msg.payload.clientId) || []).forEach(fn => fn(msg.payload.status));
        break;
      case 'client_geo':
        clientsStore.updateGeo(msg.payload.clientId, msg.payload.country, msg.payload.countryName);
        break;
      case 'metrics_update': {
        const listeners = metricsListeners.get(msg.payload.clientId) || [];
        listeners.forEach(fn => fn(msg.payload.metrics));
        break;
      }
      case 'command_result':
      case 'command_stream': {
        const listeners = commandListeners.get(msg.payload.msgId) || [];
        listeners.forEach(fn => fn(msg.payload));
        break;
      }
      case 'terminal_opened':
      case 'terminal_data':
      case 'terminal_close':
        terminalListeners.forEach(fn => fn(msg));
        break;
    }
  }

  function send(data: any) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(data));
    }
  }

  function onMetrics(clientId: string, callback: (data: any) => void) {
    const list = metricsListeners.get(clientId) || [];
    list.push(callback);
    metricsListeners.set(clientId, list);
    return () => {
      const idx = list.indexOf(callback);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  function onStatus(clientId: string, callback: (status: string) => void) {
    const list = statusListeners.get(clientId) || [];
    list.push(callback);
    statusListeners.set(clientId, list);
    return () => {
      const idx = list.indexOf(callback);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  function onCommand(msgId: string, callback: (data: any) => void) {
    const list = commandListeners.get(msgId) || [];
    list.push(callback);
    commandListeners.set(msgId, list);
    return () => {
      commandListeners.delete(msgId);
    };
  }

  function onTerminal(callback: (msg: any) => void) {
    terminalListeners.push(callback);
    return () => {
      const idx = terminalListeners.indexOf(callback);
      if (idx >= 0) terminalListeners.splice(idx, 1);
    };
  }

  function disconnect() {
    ws.value?.close();
    ws.value = null;
  }

  return { connected, connect, disconnect, send, onMetrics, onStatus, onCommand, onTerminal };
});
