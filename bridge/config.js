/**
 * Configuration for the K-WATCH BLE-to-MQTT bridge.
 * All values can be overridden via environment variables.
 */

const path = require('path');

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
  messageTimeout: parseInt(process.env.MESSAGE_TIMEOUT, 10) || 120,
  interPacketDelay: parseInt(process.env.INTER_PACKET_DELAY, 10) || 50,
  batteryPollInterval: parseInt(process.env.BATTERY_POLL_INTERVAL, 10) || 300,

  // Persistence
  knownDeviceFile: process.env.KNOWN_DEVICE_FILE || path.join(__dirname, 'known-device.json'),
  historyFile: process.env.HISTORY_FILE || path.join(__dirname, 'history.json'),
  maxHistoryEntries: 50,
};
