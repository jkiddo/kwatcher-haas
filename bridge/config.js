/**
 * Configuration for the K-WATCH BLE-to-MQTT bridge.
 * All values can be overridden via environment variables or a .env file.
 */

const fs = require('fs');
const path = require('path');

// Load .env file if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

module.exports = {
  // MQTT
  mqttBroker: process.env.MQTT_BROKER || 'mqtt://homeassistant.local:1883',
  mqttUsername: process.env.MQTT_USERNAME || '',
  mqttPassword: process.env.MQTT_PASSWORD || '',
  mqttBaseTopic: process.env.MQTT_BASE_TOPIC || 'kwatch',

  // BLE
  deviceName: process.env.DEVICE_NAME || 'K-WATCH',
  scanTimeout: parseInt(process.env.SCAN_TIMEOUT, 10) || 10,

  // Timing
  reconnectBaseDelay: parseInt(process.env.RECONNECT_BASE_DELAY, 10) || 5,
  reconnectMaxDelay: parseInt(process.env.RECONNECT_MAX_DELAY, 10) || 300,
  messageTimeout: parseInt(process.env.MESSAGE_TIMEOUT, 10) || 180,
  interPacketDelay: parseInt(process.env.INTER_PACKET_DELAY, 10) || 50,
  batteryPollInterval: parseInt(process.env.BATTERY_POLL_INTERVAL, 10) || 300,

  // Unsolicited event timeout (minutes) — events after this are sent as phone notifications
  unsolicitedTimeout: parseFloat(process.env.UNSOLICITED_TIMEOUT) || 3,

  // Home Assistant (for phone notifications)
  haUrl: process.env.HA_URL || 'http://homeassistant.local:8123',
  haToken: process.env.HA_TOKEN || '',
  notifyService: process.env.HA_NOTIFY_SERVICE || 'mobile_app_pixel_10_pro_xl',

  // Weather
  owmApiKey: process.env.OWM_API_KEY || '',
  waqiToken: process.env.WAQI_TOKEN || '',
  owmLat: process.env.OWM_LAT || '',
  owmLon: process.env.OWM_LON || '',

  // Persistence
  knownDeviceFile: process.env.KNOWN_DEVICE_FILE || path.join(__dirname, 'known-device.json'),
  historyFile: process.env.HISTORY_FILE || path.join(__dirname, 'history.json'),
  settingsFile: process.env.SETTINGS_FILE || path.join(__dirname, 'settings.json'),
  maxHistoryEntries: 50,
};
