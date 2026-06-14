<template>
  <el-dialog
    :model-value="modelValue"
    :title="`安装节点 · ${client?.name || ''}`"
    width="640px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="install-body">

      <!-- <div class="field">
        <div class="field-label">Agent 服务器地址</div>
        <el-input v-model="serverUrl" placeholder="ws://your-server:3000/ws/agent">
          <template #prepend>WS</template>
        </el-input>
        <div class="field-hint">节点上报数据的 WebSocket 地址，默认按当前访问域名推导，可手动修改。</div>
      </div>

      <div class="field">
        <div class="field-label">节点 Token</div>
        <el-input :model-value="token" readonly>
          <template #append>
            <el-button :icon="CopyDocument" @click="copy(token, 'Token')" />
          </template>
        </el-input>
      </div> -->

      <!-- 系统切换 -->
      <el-tabs v-model="os" class="os-tabs">
        <el-tab-pane label="Linux" name="linux" />
        <el-tab-pane label="macOS" name="darwin" />
        <el-tab-pane label="Windows" name="windows" />
      </el-tabs>

      <!-- 安装命令 -->
      <div class="field">
        <div class="field-label">
          一键安装命令
          <span class="cmd-note">{{ os === 'windows' ? '以管理员身份运行 PowerShell' : '使用 root 权限运行' }}</span>
        </div>
        <div class="cmd-box">
          <pre>{{ command }}</pre>
          <el-button class="cmd-copy" type="primary" :icon="CopyDocument" @click="copy(command, '安装命令')">
            复制
          </el-button>
        </div>
        <div class="field-hint">命令会下载安装脚本并自动写入上述 Token 与服务器地址，注册为开机自启服务。</div>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';
import type { ClientInfo } from '../stores/clients';

const props = defineProps<{
  modelValue: boolean;
  client: ClientInfo | null;
}>();
defineEmits<{ 'update:modelValue': [value: boolean] }>();

const REPO = 'imblowsnow/monitor-system';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/refs/heads/main/scripts`;

const os = ref<'linux' | 'darwin' | 'windows'>('linux');
const serverUrl = ref(defaultServerUrl());

// 弹窗每次打开时按当前域名重新推导服务器地址
watch(() => props.modelValue, (open) => {
  if (open) serverUrl.value = defaultServerUrl();
});

function defaultServerUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws/agent`;
}

const token = computed(() => props.client?.token || '');

const command = computed(() => {
  const t = token.value;
  const url = serverUrl.value;
  if (os.value === 'windows') {
    return `powershell -Command "iwr ${RAW_BASE}/install.ps1 -OutFile $env:TEMP\\install.ps1; & $env:TEMP\\install.ps1 -Token '${t}' -ServerUrl '${url}'"`;
  }
  // linux / macos 共用 install.sh，脚本内部按 uname 自动识别
  return `curl -fsSL ${RAW_BASE}/install.sh | sudo bash -s -- '${t}' '${url}'`;
});

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(`${label}已复制`);
  } catch {
    // 非安全上下文(http)下 clipboard API 不可用，降级到 execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ElMessage.success(`${label}已复制`);
    } catch {
      ElMessage.error('复制失败，请手动复制');
    }
    document.body.removeChild(ta);
  }
}
</script>

<style scoped>
.install-body { display: flex; flex-direction: column; gap: 18px; }
.field-label {
  font-size: 13px; font-weight: 600; color: var(--text-1);
  margin-bottom: 8px; display: flex; align-items: center; gap: 10px;
}
.cmd-note { font-size: 12px; font-weight: 400; color: var(--text-3); }
.field-hint { font-size: 12px; color: var(--text-3); margin-top: 6px; line-height: 1.5; }
.os-tabs :deep(.el-tabs__header) { margin-bottom: 0; }

.cmd-box { position: relative; }
.cmd-box pre {
  margin: 0;
  padding: 14px 90px 14px 14px;
  background: var(--fill-2, rgba(127,127,127,0.1));
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-1);
  white-space: pre-wrap;
  word-break: break-all;
}
.cmd-copy { position: absolute; top: 10px; right: 10px; }
</style>
