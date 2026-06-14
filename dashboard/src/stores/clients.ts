import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../api/index';

export interface ClientInfo {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  os: string;
  arch: string;
  osPlatform?: string;
  osVersion?: string;
  country?: string;
  countryName?: string;
  groupName: string;
  agentVersion: string;
  status: 'online' | 'warning' | 'offline';
  tags: string[];
  sortOrder?: number;
}

export const useClientsStore = defineStore('clients', () => {
  const clients = ref<ClientInfo[]>([]);
  const loading = ref(false);

  const onlineCount = computed(() => clients.value.filter(c => c.status === 'online').length);
  const offlineCount = computed(() => clients.value.filter(c => c.status === 'offline').length);

  async function fetchClients() {
    loading.value = true;
    try {
      const { data } = await api.get('/clients');
      clients.value = data;
    } finally {
      loading.value = false;
    }
  }

  function updateStatus(clientId: string, status: 'online' | 'warning' | 'offline') {
    const client = clients.value.find(c => c.id === clientId);
    if (client) {
      client.status = status;
    }
  }

  function updateGeo(clientId: string, country: string, countryName: string) {
    const client = clients.value.find(c => c.id === clientId);
    if (client) {
      client.country = country;
      client.countryName = countryName;
    }
  }

  return { clients, loading, onlineCount, offlineCount, fetchClients, updateStatus, updateGeo };
});
