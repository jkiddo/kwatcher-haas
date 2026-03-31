/**
 * K-WATCH BLE-to-MQTT Bridge
 *
 * Connects to a K-WATCH via BLE and bridges messages to/from Home Assistant
 * via MQTT with auto-discovery.
 */

const config = require('./config');
const BleConnection = require('./ble/connection');
const { encodeTimeSync, encodeBatteryRequest, encodeNotification, encodeVibrate } = require('./ble/protocol');
const { fetchAndEncodeWeather } = require('./weather');
const MqttBridge = require('./mqtt/client');
const { publishDiscovery } = require('./mqtt/discovery');
const HistoryManager = require('./mqtt/history');

const ble = new BleConnection(config);
const mqtt = new MqttBridge(config);
const history = new HistoryManager(config, mqtt);

let batteryInterval = null;

// ── BLE Events ──────────────────────────────────────────────────────────

ble.on('connected', async () => {
  console.log('[BRIDGE] Watch connected');
  mqtt.publishRetained('device/connection', 'online');

  // Initial handshake
  try {
    await ble.write(encodeTimeSync());
    await sleep(config.interPacketDelay);
    await ble.write(encodeBatteryRequest());
  } catch (err) {
    console.error(`[BRIDGE] Handshake failed: ${err.message}`);
  }

  // Poll battery periodically
  batteryInterval = setInterval(async () => {
    try {
      await ble.write(encodeBatteryRequest());
    } catch (_) {}
  }, config.batteryPollInterval * 1000);
});

ble.on('disconnected', () => {
  console.log('[BRIDGE] Watch disconnected');
  mqtt.publishRetained('device/connection', 'offline');
  clearInterval(batteryInterval);
  batteryInterval = null;
});

ble.on('data', (parsed) => {
  if (parsed.type === 'battery') {
    mqtt.publishRetained('device/battery', JSON.stringify({
      level: parsed.level,
      charging: parsed.charging,
    }));
  } else if (parsed.type === 'event') {
    if (parsed.action === 'ok' || parsed.action === 'no') {
      const response = parsed.action === 'ok' ? 'OK - got it' : 'No';
      history.resolveMessage(response);
      mqtt.publish('device/event', JSON.stringify({
        action: parsed.action,
        timestamp: new Date().toISOString(),
      }));
    }
  }
});

// ── MQTT Events ─────────────────────────────────────────────────────────

mqtt.on('command', async (topic, payload) => {
  if (topic.endsWith('send_message')) {
    try {
      const { title = 'HA', message } = JSON.parse(payload.toString());
      if (!message) return;

      if (!ble.connected) {
        console.log('[BRIDGE] Cannot send message: watch not connected');
        return;
      }

      console.log(`[BRIDGE] Sending message: "${message}" (title: "${title}")`);
      const packets = encodeNotification(title, message);
      for (const pkt of packets) {
        await ble.write(pkt);
        await sleep(config.interPacketDelay);
      }

      history.addMessage(title, message);
    } catch (err) {
      console.error(`[BRIDGE] Send message failed: ${err.message}`);
    }
  } else if (topic.endsWith('clear_history')) {
    console.log('[BRIDGE] Clearing message history');
    history.clear();
  } else if (topic.endsWith('vibrate')) {
    if (!ble.connected) {
      console.log('[BRIDGE] Cannot vibrate: watch not connected');
      return;
    }
    console.log('[BRIDGE] Vibrating watch');
    for (const pkt of encodeVibrate()) {
      await ble.write(pkt);
      await sleep(300);
    }
  } else if (topic.endsWith('sync_time')) {
    if (!ble.connected) {
      console.log('[BRIDGE] Cannot sync time: watch not connected');
      return;
    }
    console.log('[BRIDGE] Syncing time to watch');
    await ble.write(encodeTimeSync());
  } else if (topic.endsWith('sync_weather')) {
    if (!ble.connected) {
      console.log('[BRIDGE] Cannot sync weather: watch not connected');
      return;
    }
    try {
      console.log('[BRIDGE] Fetching weather from OpenWeatherMap...');
      const packets = await fetchAndEncodeWeather(config);
      console.log(`[BRIDGE] Syncing ${packets.length} days of weather to watch`);
      for (const pkt of packets) {
        await ble.write(pkt);
        await sleep(config.interPacketDelay);
      }
    } catch (err) {
      console.error(`[BRIDGE] Weather sync failed: ${err.message}`);
    }
  }
});

// ── Startup ─────────────────────────────────────────────────────────────

async function main() {
  console.log('[BRIDGE] Starting K-WATCH BLE-to-MQTT bridge');

  await mqtt.connect();
  publishDiscovery(mqtt, config);
  history.load();

  ble.start().catch(err => {
    console.error(`[BRIDGE] BLE start failed: ${err.message}`);
  });
}

// ── Shutdown ────────────────────────────────────────────────────────────

async function shutdown() {
  console.log('[BRIDGE] Shutting down...');
  clearInterval(batteryInterval);
  await ble.stop();
  mqtt.publishRetained('device/connection', 'offline');
  await sleep(500); // let MQTT publish drain
  mqtt.disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error(`[BRIDGE] Fatal: ${err.message}`);
  process.exit(1);
});
