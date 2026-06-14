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

      <!-- 下载源切换 -->
      <div class="field">
        <div class="field-label">脚本下载源</div>
        <el-radio-group v-model="source">
          <el-radio-button value="github">GitHub</el-radio-button>
          <el-radio-button value="cdn">CDN（国内加速）</el-radio-button>
        </el-radio-group>
        <div class="field-hint">GitHub 直连在国内可能不稳定，访问失败时可切换到 CDN（jsDelivr）。</div>
      </div>

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

      <!-- 卸载命令 -->
      <div class="field">
        <div class="field-label">
          一键卸载命令
          <span class="cmd-note">{{ os === 'windows' ? '以管理员身份运行 PowerShell' : '使用 root 权限运行' }}</span>
        </div>
        <div class="cmd-box">
          <pre>{{ uninstallCommand }}</pre>
          <el-button class="cmd-copy" type="primary" :icon="CopyDocument" @click="copy(uninstallCommand, '卸载命令')">
            复制
          </el-button>
        </div>
        <div class="field-hint">停止并删除服务，移除安装目录（含二进制与配置文件）。</div>
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

const os = ref<'linux' | 'darwin' | 'windows'>('linux');
const source = ref<'github' | 'cdn'>('github');
const serverUrl = ref(defaultServerUrl());

// 按下载源推导脚本目录地址：GitHub raw 直连 / jsDelivr CDN 加速
const rawBase = computed(() =>
  source.value === 'cdn'
    ? `https://cdn.jsdelivr.net/gh/${REPO}@main/scripts`
    : `https://raw.githubusercontent.com/${REPO}/refs/heads/main/scripts`,
);

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
  const base = rawBase.value;
  if (os.value === 'windows') {
    return `powershell -Command "iwr ${base}/install.ps1 -OutFile $env:TEMP\\install.ps1; & $env:TEMP\\install.ps1 -Token '${t}' -ServerUrl '${url}'"`;
  }
  // linux / macos 共用 install.sh，脚本内部按 uname 自动识别
  return `curl -fsSL ${base}/install.sh | sudo bash -s -- '${t}' '${url}'`;
});

const uninstallCommand = computed(() => {
  if (os.value === 'windows') {
    // 停止并删除 MonitorAgent 服务，再移除安装目录（PowerShell）
    return `net stop MonitorAgent; sc.exe delete MonitorAgent; Remove-Item -Recurse -Force "$env:ProgramData\\monitor-agent"`;
  }
  if (os.value === 'darwin') {
    // macOS：卸载 launchd 守护进程并删除安装目录
    return `sudo launchctl unload /Library/LaunchDaemons/com.monitor-agent.plist; sudo rm -f /Library/LaunchDaemons/com.monitor-agent.plist; sudo rm -rf /opt/monitor-agent`;
  }
  // Linux：停止禁用 systemd 服务并删除安装目录
  return `sudo systemctl disable --now monitor-agent; sudo rm -f /etc/systemd/system/monitor-agent.service; sudo systemctl daemon-reload; sudo rm -rf /opt/monitor-agent`;
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
