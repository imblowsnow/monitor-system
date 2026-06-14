<template>
  <div class="login-page">
    <div class="login-bg" />
    <div class="login-top">
      <ThemeToggle />
    </div>

    <div class="login-card">
      <div class="login-brand">
        <div class="brand-mark"><el-icon :size="26"><Monitor /></el-icon></div>
        <h1>Monitor System</h1>
        <p>登录后台管理</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="field">
          <label>用户名</label>
          <el-input v-model="form.username" size="large" placeholder="请输入用户名" :prefix-icon="User" />
        </div>
        <div class="field">
          <label>密码</label>
          <el-input
            v-model="form.password"
            type="password"
            size="large"
            placeholder="请输入密码"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="handleLogin"
          />
        </div>
        <el-button
          type="primary"
          size="large"
          native-type="submit"
          :loading="loading"
          class="login-btn"
        >
          登录
        </el-button>
      </form>

      <router-link to="/" class="to-public">← 返回状态页</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Monitor, User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import ThemeToggle from '../components/ThemeToggle.vue';

const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function handleLogin() {
  if (!form.username || !form.password) {
    ElMessage.warning('请填写完整');
    return;
  }
  loading.value = true;
  try {
    await authStore.login(form.username, form.password);
    router.push('/admin');
  } catch {
    ElMessage.error('登录失败，请检查用户名和密码');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-body);
  overflow: hidden;
}
.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 20%, var(--brand-soft), transparent 45%),
    radial-gradient(circle at 80% 80%, var(--c-up-soft), transparent 45%);
  pointer-events: none;
}
.login-top {
  position: absolute;
  top: 20px;
  right: 24px;
}
.login-card {
  position: relative;
  width: 400px;
  max-width: calc(100vw - 40px);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 36px 34px 28px;
}
.login-brand {
  text-align: center;
  margin-bottom: 28px;
}
.brand-mark {
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  border-radius: 16px;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-brand h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-1);
}
.login-brand p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-3);
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}
.login-btn {
  width: 100%;
  margin-top: 4px;
}
.to-public {
  display: block;
  text-align: center;
  margin-top: 20px;
  font-size: 13px;
  color: var(--text-3);
  text-decoration: none;
  transition: color 0.18s ease;
}
.to-public:hover {
  color: var(--brand);
}
</style>
