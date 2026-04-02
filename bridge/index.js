/**
 * K-WATCH BLE-to-MQTT Bridge
 *
 * Connects to a K-WATCH via BLE and bridges messages to/from Home Assistant
 * via MQTT with auto-discovery.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const config = require('./config');
const BleConnection = require('./ble/connection');
const { encodeTimeSync, encodeBatteryRequest, encodeNotification, encodeVibrate, encodeHeartRateStart, encodeHeartRateStop } = require('./ble/protocol');
const { fetchAndEncodeWeather } = require('./weather');
const MqttBridge = require('./mqtt/client');
const { publishDiscovery } = require('./mqtt/discovery');
const HistoryManager = require('./mqtt/history');

const ble = new BleConnection(config);
const mqtt = new MqttBridge(config);
const history = new HistoryManager(config, mqtt);

let batteryInterval = null;
let lastBatteryPayload = null;
let unsolicitedTimeoutMinutes = config.unsolicitedTimeout;

// ── Settings persistence ───────────────────────────────────────────────

function loadSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(config.settingsFile, 'utf8'));
    if (data.unsolicitedTimeout != null) unsolicitedTimeoutMinutes = data.unsolicitedTimeout;
    console.log(`[BRIDGE] Loaded settings: unsolicited timeout = ${unsolicitedTimeoutMinutes} min`);
  } catch (_) {}
}

function saveSettings() {
  try {
    fs.writeFileSync(config.settingsFile, JSON.stringify({ unsolicitedTimeout: unsolicitedTimeoutMinutes }));
  } catch (err) {
    console.error(`[BRIDGE] Failed to save settings: ${err.message}`);
  }
}

function applyUnsolicitedTimeout(minutes) {
  unsolicitedTimeoutMinutes = minutes;
  history.setMessageTimeout(minutes * 60);
  mqtt.publishRetained('config/unsolicited_timeout', String(minutes));
  saveSettings();
  console.log(`[BRIDGE] Unsolicited timeout set to ${minutes} min`);
}

// ── HA phone notification ──────────────────────────────────────────────

const EVENT_LABELS = { ok: 'Take Photo', no: 'Find Phone' };

function sendPhoneNotification(action) {
  if (!config.haToken) {
    console.log('[BRIDGE] No HA_TOKEN configured, skipping phone notification');
    return;
  }

  const label = EVENT_LABELS[action] || action;
  const url = new URL(`/api/services/notify/${config.notifyService}`, config.haUrl);
  const transport = url.protocol === 'https:' ? https : http;
  const body = JSON.stringify({
    title: 'K-WATCH',
    message: `${label} button pressed`,
  });

  const req = transport.request(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.haToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, (res) => {
    if (res.statusCode !== 200) {
      console.error(`[BRIDGE] Phone notification failed: HTTP ${res.statusCode}`);
    } else {
      console.log(`[BRIDGE] Phone notification sent: ${label}`);
    }
    res.resume();
  });

  req.on('error', (err) => {
    console.error(`[BRIDGE] Phone notification error: ${err.message}`);
  });

  req.write(body);
  req.end();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function writePackets(packets, delay) {
  for (const pkt of packets) {
    await ble.write(pkt);
    await sleep(delay);
  }
}

// ── BLE Events ──────────────────────────────────────────────────────────

ble.on('connected', async () => {
  console.log('[BRIDGE] Watch connected');
  mqtt.publishRetained('device/connection', 'online');

  try {
    await ble.write(encodeTimeSync());
    await sleep(config.interPacketDelay);
    await ble.write(encodeBatteryRequest());
  } catch (err) {
    console.error(`[BRIDGE] Handshake failed: ${err.message}`);
  }

  // Clear any stacked interval from rapid reconnects
  clearInterval(batteryInterval);
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
  lastBatteryPayload = null;
});

ble.on('data', (parsed) => {
  if (parsed.type === 'battery') {
    const payload = JSON.stringify({ level: parsed.level, charging: parsed.charging });
    if (payload !== lastBatteryPayload) {
      lastBatteryPayload = payload;
      mqtt.publishRetained('device/battery', payload);
    }
  } else if (parsed.type === 'heart_rate') {
    console.log(`[BRIDGE] Heart rate: ${parsed.hr} bpm`);
    mqtt.publishRetained('device/heart_rate', JSON.stringify({
      bpm: parsed.hr,
      timestamp: new Date().toISOString(),
    }));
  } else if (parsed.type === 'event') {
    if (parsed.action === 'ok' || parsed.action === 'no') {
      const unsolicited = !history.hasPendingMessage();

      if (unsolicited) {
        console.log(`[BRIDGE] Unsolicited watch event: ${parsed.action}`);
        sendPhoneNotification(parsed.action);
      } else {
        const response = parsed.action === 'ok' ? 'OK - got it' : 'No';
        history.resolveMessage(response);
      }

      mqtt.publish('device/event', JSON.stringify({
        action: parsed.action,
        unsolicited,
        timestamp: new Date().toISOString(),
      }));
    }
  }
});

// ── MQTT Events ─────────────────────────────────────────────────────────

mqtt.on('command', async (topic, payload) => {
  try {
    if (topic.endsWith('unsolicited_timeout/set')) {
      const minutes = parseFloat(payload.toString());
      if (!isNaN(minutes) && minutes >= 1 && minutes <= 30) {
        applyUnsolicitedTimeout(minutes);
      }
      return;
    }

    if (topic.endsWith('send_message')) {
      const { title = 'HA', message } = JSON.parse(payload.toString());
      if (!message) return;
      if (!ble.connected) { console.log('[BRIDGE] Cannot send: not connected'); return; }

      console.log(`[BRIDGE] Sending message: "${message}" (title: "${title}")`);
      await writePackets(encodeNotification(title, message), config.interPacketDelay);
      history.addMessage(title, message);

    } else if (topic.endsWith('clear_history')) {
      console.log('[BRIDGE] Clearing message history');
      history.clear();

    } else if (topic.endsWith('vibrate')) {
      if (!ble.connected) { console.log('[BRIDGE] Cannot vibrate: not connected'); return; }
      console.log('[BRIDGE] Vibrating watch');
      await writePackets(encodeVibrate(), 300);

    } else if (topic.endsWith('sync_time')) {
      if (!ble.connected) { console.log('[BRIDGE] Cannot sync time: not connected'); return; }
      console.log('[BRIDGE] Syncing time to watch');
      await ble.write(encodeTimeSync());

    } else if (topic.endsWith('measure_heart_rate')) {
      if (!ble.connected) { console.log('[BRIDGE] Cannot measure HR: not connected'); return; }
      console.log('[BRIDGE] Starting heart rate measurement');
      await ble.write(encodeHeartRateStart());

    } else if (topic.endsWith('stop_heart_rate')) {
      if (!ble.connected) { console.log('[BRIDGE] Cannot stop HR: not connected'); return; }
      console.log('[BRIDGE] Stopping heart rate measurement');
      await ble.write(encodeHeartRateStop());

    } else if (topic.endsWith('sync_weather')) {
      if (!ble.connected) { console.log('[BRIDGE] Cannot sync weather: not connected'); return; }
      console.log('[BRIDGE] Fetching weather from OpenWeatherMap...');
      const packets = await fetchAndEncodeWeather(config);
      console.log(`[BRIDGE] Syncing ${packets.length} days of weather to watch`);
      await writePackets(packets, config.interPacketDelay);
    }
  } catch (err) {
    console.error(`[BRIDGE] Command "${topic}" failed: ${err.message}`);
  }
});

// ── Startup ─────────────────────────────────────────────────────────────

async function main() {
  console.log('[BRIDGE] Starting K-WATCH BLE-to-MQTT bridge');

  loadSettings();
  await mqtt.connect();
  publishDiscovery(mqtt, config);
  applyUnsolicitedTimeout(unsolicitedTimeoutMinutes);
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
  await sleep(500);
  mqtt.disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(err => {
  console.error(`[BRIDGE] Fatal: ${err.message}`);
  process.exit(1);
});
