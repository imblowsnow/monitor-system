#!/bin/bash
set -e

INSTALL_DIR="/opt/monitor-agent"
SERVICE_NAME="monitor-agent"
REPO="imblowsnow/monitor-system"

# 参数 $1 可选，直接指定下载地址（覆盖自动探测）
DOWNLOAD_URL="${1:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

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
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
fi

echo "Updating Monitor Agent..."
echo "Download URL: $DOWNLOAD_URL"

systemctl stop $SERVICE_NAME || true

BACKUP="$INSTALL_DIR/monitor-agent.bak"
cp "$INSTALL_DIR/monitor-agent" "$BACKUP" 2>/dev/null || true

echo "Downloading new version..."
if command -v curl &>/dev/null; then
  curl -fSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/monitor-agent"
elif command -v wget &>/dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$INSTALL_DIR/monitor-agent"
else
  echo "Neither curl nor wget found" >&2
  exit 1
fi

chmod +x "$INSTALL_DIR/monitor-agent"

systemctl start $SERVICE_NAME

sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
  echo "Update successful."
  rm -f "$BACKUP"
else
  echo "Update failed, rolling back..."
  cp "$BACKUP" "$INSTALL_DIR/monitor-agent"
  systemctl start $SERVICE_NAME
  echo "Rolled back to previous version."
  exit 1
fi
