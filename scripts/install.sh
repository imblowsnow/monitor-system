#!/bin/bash
set -e

INSTALL_DIR="/opt/monitor-agent"
SERVICE_NAME="monitor-agent"
REPO="imblowsnow/monitor-system"

# 参数：
#   $1 TOKEN
#   $2 SERVER_URL
#   $3 可选，直接指定下载地址（覆盖自动探测）
TOKEN="${1:-}"
SERVER_URL="${2:-ws://your-server.com:3000/ws/agent}"
DOWNLOAD_URL="${3:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# 根据系统架构选择对应二进制名称
detect_asset() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in
    x86_64 | amd64) arch="amd64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
  esac
  case "$os" in
    linux) echo "monitor-agent-linux-${arch}" ;;
    darwin) echo "monitor-agent-darwin-${arch}" ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac
}

if [ -z "$DOWNLOAD_URL" ]; then
  ASSET="$(detect_asset)"
  # GitHub 的 latest/download 会自动重定向到最新 Release 的资产
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
fi

echo "Installing Monitor Agent..."
echo "Download URL: $DOWNLOAD_URL"

mkdir -p "$INSTALL_DIR"

# 把安装脚本自身落地到安装目录，供 agent 自更新时复用（覆盖安装）。
# 注意：curl | bash 管道安装时脚本来自 stdin，$0 不是真实文件，cp 拿不到源；
# 这种情况下回退为从仓库下载 install.sh。
SCRIPT_SRC="$(readlink -f "$0" 2>/dev/null || echo "$0")"
SCRIPT_RAW_URL="https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh"
if [ -f "$SCRIPT_SRC" ] && [ "$SCRIPT_SRC" != "$INSTALL_DIR/install.sh" ]; then
  cp -f "$SCRIPT_SRC" "$INSTALL_DIR/install.sh" 2>/dev/null || true
elif [ ! -f "$INSTALL_DIR/install.sh" ]; then
  if command -v curl &>/dev/null; then
    curl -fsSL "$SCRIPT_RAW_URL" -o "$INSTALL_DIR/install.sh" 2>/dev/null || true
  elif command -v wget &>/dev/null; then
    wget -q "$SCRIPT_RAW_URL" -O "$INSTALL_DIR/install.sh" 2>/dev/null || true
  fi
fi
chmod +x "$INSTALL_DIR/install.sh" 2>/dev/null || true

echo "Downloading agent binary..."
if command -v curl &>/dev/null; then
  curl -fSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/monitor-agent.new"
elif command -v wget &>/dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$INSTALL_DIR/monitor-agent.new"
else
  echo "Neither curl nor wget found" >&2
  exit 1
fi

chmod +x "$INSTALL_DIR/monitor-agent.new"
# 原子替换：先下载到 .new，校验非空后再 mv 覆盖，避免下载中断损坏现有二进制。
if [ ! -s "$INSTALL_DIR/monitor-agent.new" ]; then
  echo "Downloaded binary is empty, abort" >&2
  rm -f "$INSTALL_DIR/monitor-agent.new"
  exit 1
fi
mv -f "$INSTALL_DIR/monitor-agent.new" "$INSTALL_DIR/monitor-agent"

# config.json 幂等：已存在且本次未显式传入 TOKEN 时保留原配置（用于覆盖更新场景）。
if [ -n "$TOKEN" ] || [ ! -f "$INSTALL_DIR/config.json" ]; then
  cat > "$INSTALL_DIR/config.json" <<EOF
{
  "server_url": "$SERVER_URL",
  "token": "$TOKEN"
}
EOF
else
  echo "Keeping existing config.json"
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

if [ "$OS" = "darwin" ]; then
  # macOS 使用 launchd 注册开机自启
  PLIST="/Library/LaunchDaemons/com.${SERVICE_NAME}.plist"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.${SERVICE_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>$INSTALL_DIR/monitor-agent</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$INSTALL_DIR/agent.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_DIR/agent.err.log</string>
</dict>
</plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "Monitor Agent installed and started (launchd)."
  echo "Status: sudo launchctl list | grep ${SERVICE_NAME}"
else
  # Linux 使用 systemd
  cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=Monitor Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/monitor-agent
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable $SERVICE_NAME
  # 用 restart 而非 start：覆盖安装/更新时需重启以加载新二进制。
  systemctl restart $SERVICE_NAME

  echo "Monitor Agent installed and started."
  echo "Status: systemctl status $SERVICE_NAME"
fi
