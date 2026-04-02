#!/bin/bash
set -e

echo "=== K-WATCH BLE-to-MQTT Bridge Installer ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Install system dependencies
echo "Installing system packages..."
sudo apt-get update
sudo apt-get install -y bluetooth bluez libbluetooth-dev libudev-dev build-essential

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node.js $(node --version)"

# Copy bridge files
echo "Installing bridge to /opt/kwatch-bridge..."
sudo mkdir -p /opt/kwatch-bridge/ble /opt/kwatch-bridge/mqtt
sudo cp package.json config.js index.js weather.js /opt/kwatch-bridge/
sudo cp ble/*.js /opt/kwatch-bridge/ble/
sudo cp mqtt/*.js /opt/kwatch-bridge/mqtt/

# Copy .env if not already present (don't overwrite existing config)
if [ ! -f /opt/kwatch-bridge/.env ]; then
    if [ -f .env ]; then
        sudo cp .env /opt/kwatch-bridge/.env
        echo "Copied .env — edit /opt/kwatch-bridge/.env with your credentials"
    elif [ -f .env.example ]; then
        sudo cp .env.example /opt/kwatch-bridge/.env
        echo "Copied .env.example — edit /opt/kwatch-bridge/.env with your credentials"
    fi
else
    echo "Existing .env preserved"
fi

# Install npm dependencies
echo "Installing npm dependencies..."
cd /opt/kwatch-bridge
sudo npm install --production

# Grant Node.js BLE access without root
echo "Setting BLE capabilities on node binary..."
sudo setcap cap_net_raw,cap_net_admin+eip "$(which node)"

# Install systemd service
echo "Installing systemd service..."
sudo cp "$SCRIPT_DIR/kwatch-bridge.service" /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable kwatch-bridge

echo ""
echo "=== Installation complete ==="
echo ""
echo "Before starting, edit the service environment variables:"
echo "  sudo systemctl edit kwatch-bridge"
echo ""
echo "Add your MQTT credentials:"
echo "  [Service]"
echo "  Environment=MQTT_BROKER=mqtt://your-ha-ip:1883"
echo "  Environment=MQTT_USERNAME=your-user"
echo "  Environment=MQTT_PASSWORD=your-pass"
echo ""
echo "Then start the service:"
echo "  sudo systemctl start kwatch-bridge"
echo "  sudo journalctl -u kwatch-bridge -f"
