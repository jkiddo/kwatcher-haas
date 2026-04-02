/**
 * BLE connection manager for the K-WATCH using noble.
 * Handles scanning, connecting, reconnecting, keepalive, and writes.
 */

const EventEmitter = require('events');
const fs = require('fs');
const noble = require('@stoprocent/noble');
const { encodeKeepaliveResponse, parseResponse } = require('./protocol');

const TX_UUIDS = ['33f3', '000033f300001000800000805f9b34fb'];
const RX_UUIDS = ['33f4', '000033f400001000800000805f9b34fb'];

function uuidMatch(charUuid, candidates) {
  const normalized = charUuid.replace(/-/g, '').toLowerCase();
  return candidates.some(c => normalized === c || normalized.endsWith(c));
}

class BleConnection extends EventEmitter {
  constructor(config) {
    super();
    this._config = config;
    this._peripheral = null;
    this._txChar = null;
    this._rxChar = null;
    this._connected = false;
    this._shuttingDown = false;
    this._reconnectDelay = config.reconnectBaseDelay;
    this._reconnectTimer = null;
    this._knownDevice = null;
  }

  get connected() {
    return this._connected;
  }

  async start() {
    this._shuttingDown = false;

    console.log(`[BLE] Noble state: ${noble.state}`);
    if (noble.state !== 'poweredOn') {
      console.log('[BLE] Waiting for Bluetooth adapter...');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          noble.removeListener('stateChange', onState);
          console.log(`[BLE] Timeout. Noble state is: ${noble.state}`);
          reject(new Error('Bluetooth adapter timeout'));
        }, 15000);
        const onState = (state) => {
          console.log(`[BLE] State changed: ${state}`);
          if (state === 'poweredOn') {
            noble.removeListener('stateChange', onState);
            clearTimeout(timeout);
            resolve();
          }
        };
        noble.on('stateChange', onState);
        if (noble.state === 'poweredOn') {
          noble.removeListener('stateChange', onState);
          clearTimeout(timeout);
          resolve();
        }
      });
    }
    console.log('[BLE] Adapter ready');

    // Try auto-reconnect to known device first
    const known = this._knownDevice || this._loadKnownDevice();
    if (known) {
      console.log(`[BLE] Known device: ${known.name} (${known.id})`);
      const found = await this._scanForDevice(known.id, known.name);
      if (found) {
        await this._connectToPeripheral(found);
        return;
      }
      console.log('[BLE] Known device not found, scanning for any K-WATCH...');
    }

    const device = await this._scanForDevice(null, this._config.deviceName);
    if (device) {
      await this._connectToPeripheral(device);
    } else {
      console.log('[BLE] No device found, will retry...');
      this._scheduleReconnect();
    }
  }

  async stop() {
    this._shuttingDown = true;
    clearTimeout(this._reconnectTimer);
    try { await noble.stopScanningAsync(); } catch (_) {}
    if (this._rxChar) {
      try { this._rxChar.removeAllListeners('data'); } catch (_) {}
    }
    if (this._peripheral && this._connected) {
      try { await this._peripheral.disconnectAsync(); } catch (_) {}
    }
    this._connected = false;
    this._txChar = null;
    this._rxChar = null;
  }

  async write(data) {
    if (!this._txChar) throw new Error('TX characteristic not available');
    const buf = Buffer.alloc(20);
    data.copy(buf, 0, 0, Math.min(data.length, 20));

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const withoutResponse = attempt > 0;
        await this._txChar.writeAsync(buf, withoutResponse);
        return;
      } catch (err) {
        console.log(`[BLE] Write attempt ${attempt + 1} failed: ${err.message}`);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    throw new Error('Write failed after 3 attempts');
  }

  // ── Scanning ────────────────────────────────────────────────────────────

  async _scanForDevice(targetId, targetName) {
    const timeout = this._config.scanTimeout * 1000;

    return new Promise(async (resolve) => {
      let resolved = false;
      const done = (result) => {
        if (resolved) return;
        resolved = true;
        noble.removeListener('discover', onDiscover);
        try { noble.stopScanningAsync().catch(() => {}); } catch (_) {}
        resolve(result);
      };

      const onDiscover = (p) => {
        const name = p.advertisement.localName || p.advertisement.shortName || '';
        if (targetId && p.id === targetId) {
          console.log(`[BLE] Found known device: ${name} (${p.id})`);
          done(p);
        } else if (!targetId && name.includes(targetName)) {
          console.log(`[BLE] Found device: ${name} (${p.id})`);
          done(p);
        }
      };

      noble.on('discover', onDiscover);
      console.log(`[BLE] Scanning for ${targetId || targetName} (${this._config.scanTimeout}s)...`);
      try {
        await noble.startScanningAsync([], true);
      } catch (err) {
        console.log(`[BLE] Scan start failed: ${err.message}`);
        done(null);
        return;
      }

      setTimeout(() => done(null), timeout);
    });
  }

  // ── Connection ──────────────────────────────────────────────────────────

  async _connectToPeripheral(peripheral) {
    const name = peripheral.advertisement.localName || peripheral.id;
    const scanAddress = peripheral.address || peripheral.id;
    console.log(`[BLE] Connecting to ${name} (${scanAddress}) addressType=${peripheral.addressType}...`);

    // On Linux, the K-WATCH's locally-administered address needs random type.
    // On macOS, CoreBluetooth handles address types internally.
    if (process.platform === 'linux' && peripheral.addressType === 'public') {
      console.log(`[BLE] Overriding addressType to "random" (Linux)`);
      peripheral.addressType = 'random';
    }

    try {
      await noble.stopScanningAsync();
    } catch (_) {}

    try {
      await peripheral.connectAsync();
    } catch (err) {
      console.log(`[BLE] Connect failed: ${err.message}`);
      this._scheduleReconnect();
      return;
    }

    this._peripheral = peripheral;

    peripheral.once('disconnect', (reason) => {
      console.log(`[BLE] Disconnected (reason: ${reason})`);
      this._connected = false;
      if (this._rxChar) {
        try { this._rxChar.removeAllListeners('data'); } catch (_) {}
      }
      this._txChar = null;
      this._rxChar = null;
      this.emit('disconnected');
      if (!this._shuttingDown) this._scheduleReconnect();
    });

    console.log('[BLE] Connected, discovering services...');

    try {
      const { characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync();

      for (const c of characteristics) {
        if (uuidMatch(c.uuid, TX_UUIDS)) this._txChar = c;
        if (uuidMatch(c.uuid, RX_UUIDS)) this._rxChar = c;
      }

      if (!this._txChar || !this._rxChar) {
        throw new Error('TX/RX characteristics not found');
      }

      this._rxChar.on('data', (data) => this._onNotification(data));
      await this._rxChar.subscribeAsync();

      this._connected = true;
      this._reconnectDelay = this._config.reconnectBaseDelay;

      const deviceInfo = { id: peripheral.id, name, address: scanAddress };
      this._knownDevice = deviceInfo;
      this._saveKnownDevice(deviceInfo);

      console.log(`[BLE] Ready (TX: ${this._txChar.uuid}, RX: ${this._rxChar.uuid})`);
      this.emit('connected');

    } catch (err) {
      console.log(`[BLE] Service discovery failed: ${err.message}`);
      try { await peripheral.disconnectAsync(); } catch (_) {}
      this._scheduleReconnect();
    }
  }

  _onNotification(data) {
    const hex = data.toString('hex').replace(/(.{2})/g, '$1 ').trim();
    const parsed = parseResponse(data);

    if (parsed.type === 'keepalive') {
      this.write(encodeKeepaliveResponse()).catch(err =>
        console.log(`[BLE] Keepalive response failed: ${err.message}`)
      );
      return;
    }

    console.log(`[BLE] RX [${hex}] → ${parsed.type}${parsed.type === 'event' ? ` action=${parsed.action}` : ''}${parsed.type === 'heart_rate' ? ` hr=${parsed.hr}` : ''}${parsed.type === 'battery' ? ` level=${parsed.level}` : ''}${parsed.type === 'ack' ? ` cmd=0x${parsed.command.toString(16).padStart(2, '0')}` : ''}`);
    this.emit('data', parsed);
  }

  // ── Reconnection ────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (this._shuttingDown) return;
    clearTimeout(this._reconnectTimer);
    const delay = this._reconnectDelay;
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._config.reconnectMaxDelay);
    console.log(`[BLE] Reconnecting in ${delay}s...`);
    this._reconnectTimer = setTimeout(() => {
      if (!this._shuttingDown) this.start().catch(err => {
        console.error(`[BLE] Reconnect error: ${err.message}`);
        this._scheduleReconnect();
      });
    }, delay * 1000);
  }

  // ── Device Persistence ──────────────────────────────────────────────────

  _loadKnownDevice() {
    try {
      const data = JSON.parse(fs.readFileSync(this._config.knownDeviceFile, 'utf8'));
      this._knownDevice = data;
      return data;
    } catch (_) {
      return null;
    }
  }

  _saveKnownDevice(info) {
    try {
      fs.writeFileSync(this._config.knownDeviceFile, JSON.stringify(info, null, 2));
    } catch (err) {
      console.log(`[BLE] Failed to save known device: ${err.message}`);
    }
  }
}

module.exports = BleConnection;
