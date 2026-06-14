#!/bin/bash
set -e

INSTALL_DIR="/opt/monitor-agent"
SERVICE_NAME="monitor-agent"
DOWNLOAD_URL="${1:-http://your-server.com/agent/monitor-agent-linux-amd64}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

echo "Updating Monitor Agent..."

systemctl stop $SERVICE_NAME || true

BACKUP="$INSTALL_DIR/monitor-agent.bak"
cp "$INSTALL_DIR/monitor-agent" "$BACKUP" 2>/dev/null || true

echo "Downloading new version..."
if command -v curl &>/dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/monitor-agent"
elif command -v wget &>/dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$INSTALL_DIR/monitor-agent"
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
