import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../api/index';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const isAuthenticated = ref(!!token.value);

  async function login(username: string, password: string) {
    const { data } = await api.post('/auth/login', { username, password });
    token.value = data.token;
    isAuthenticated.value = true;
    localStorage.setItem('token', data.token);
  }

  function logout() {
    token.value = '';
    isAuthenticated.value = false;
    localStorage.removeItem('token');
  }

  return { token, isAuthenticated, login, logout };
});
