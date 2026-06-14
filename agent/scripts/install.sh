#!/bin/bash
set -e

INSTALL_DIR="/opt/monitor-agent"
SERVICE_NAME="monitor-agent"
DOWNLOAD_URL="${1:-http://your-server.com/agent/monitor-agent-linux-amd64}"
TOKEN="${2:-}"
SERVER_URL="${3:-ws://your-server.com:3000/ws/agent}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

echo "Installing Monitor Agent..."

mkdir -p "$INSTALL_DIR"

echo "Downloading agent binary..."
if command -v curl &>/dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/monitor-agent"
elif command -v wget &>/dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$INSTALL_DIR/monitor-agent"
fi

chmod +x "$INSTALL_DIR/monitor-agent"

HOSTNAME=$(hostname)
cat > "$INSTALL_DIR/config.json" <<EOF
{
  "server_url": "$SERVER_URL",
  "token": "$TOKEN"
}
EOF

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
systemctl start $SERVICE_NAME

echo "Monitor Agent installed and started."
echo "Status: systemctl status $SERVICE_NAME"
