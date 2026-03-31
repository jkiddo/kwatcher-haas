/**
 * BLE connection manager for the K-WATCH using noble.
 * Handles scanning, connecting, reconnecting, keepalive, and writes.
 */

const EventEmitter = require('events');
const fs = require('fs');
const noble = require('@stoprocent/noble');
const { encodeKeepaliveResponse, encodeTimeSync, encodeBatteryRequest, parseResponse } = require('./protocol');

const TX_UUIDS = ['33f3', '000033f300001000800000805f9b34fb'];
const RX_UUIDS = ['33f4', '000033f400001000800000805f9b34fb'];

function uuidMatch(charUuid, candidates) {
  const normalized = charUuid.replace(/-/g, '').toLowerCase();
  return candidates.some(c => normalized === c || normalized.endsWith(c));
}

class BleConnection extends EventEmitter {
  /**
   * @param {object} config
   * @param {string} config.deviceName - BLE advertised name to scan for
   * @param {number} config.scanTimeout - Seconds to scan before giving up
   * @param {number} config.reconnectBaseDelay - Initial reconnect delay (seconds)
   * @param {number} config.reconnectMaxDelay - Max reconnect delay (seconds)
   * @param {number} config.interPacketDelay - ms between multi-packet writes
   * @param {string} config.knownDeviceFile - Path to persist device info
   */
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
    this._discoveredDevices = new Map();
  }

  get connected() {
    return this._connected;
  }

  async start() {
    this._shuttingDown = false;

    // Wait for adapter to be ready
    console.log(`[BLE] Noble state: ${noble.state}`);
    if (noble.state !== 'poweredOn') {
      console.log('[BLE] Waiting for Bluetooth adapter...');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log(`[BLE] Timeout. Noble state is: ${noble.state}`);
          reject(new Error('Bluetooth adapter timeout'));
        }, 15000);
        const onState = (state) => {
          console.log(`[BLE] State changed: ${state}`);
          if (state === 'poweredOn') {
            clearTimeout(timeout);
            resolve();
          }
        };
        noble.on('stateChange', onState);
        // Check again in case state changed while setting up listener
        if (noble.state === 'poweredOn') {
          noble.removeListener('stateChange', onState);
          clearTimeout(timeout);
          resolve();
        }
      });
    }
    console.log('[BLE] Adapter ready');

    // Try auto-reconnect to known device first
    const known = this._loadKnownDevice();
    if (known) {
      console.log(`[BLE] Known device: ${known.name} (${known.id})`);
      const found = await this._scanForDevice(known.id, known.name);
      if (found) {
        await this._connectToPeripheral(found);
        return;
      }
      console.log('[BLE] Known device not found, scanning for any K-WATCH...');
    }

    // Scan for any matching device
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
    if (this._peripheral && this._connected) {
      try { await this._peripheral.disconnectAsync(); } catch (_) {}
    }
    this._connected = false;
    this._txChar = null;
    this._rxChar = null;
  }

  /**
   * Write a 20-byte packet to the TX characteristic with retry.
   * First attempt with response, subsequent without response.
   * @param {Buffer} data
   */
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
        await this._sleep(300);
      }
    }
    throw new Error('Write failed after 3 attempts');
  }

  // ── Scanning ────────────────────────────────────────────────────────────

  /**
   * Scan for a device by ID or name.
   * @param {string|null} targetId - Specific noble ID to match, or null for name match
   * @param {string} targetName - Name prefix to match
   * @returns {Promise<object|null>} Noble peripheral or null
   */
  async _scanForDevice(targetId, targetName) {
    this._discoveredDevices.clear();
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
          return;
        }
        if (!targetId && name.includes(targetName)) {
          console.log(`[BLE] Found device: ${name} (${p.id})`);
          done(p);
          return;
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

    // On Linux, force random address type for the K-WATCH's locally-administered address.
    // On macOS, CoreBluetooth handles address types internally -- don't touch it.
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

      // Subscribe to notifications
      this._rxChar.on('data', (data) => this._onNotification(data));
      await this._rxChar.subscribeAsync();

      this._connected = true;
      this._reconnectDelay = this._config.reconnectBaseDelay;
      this._saveKnownDevice({
        id: peripheral.id,
        name: name,
        address: scanAddress,
      });

      console.log(`[BLE] Ready (TX: ${this._txChar.uuid}, RX: ${this._rxChar.uuid})`);
      this.emit('connected');

    } catch (err) {
      console.log(`[BLE] Service discovery failed: ${err.message}`);
      try { await peripheral.disconnectAsync(); } catch (_) {}
      this._scheduleReconnect();
    }
  }

  _onNotification(data) {
    const parsed = parseResponse(data);

    // Handle keepalive immediately
    if (parsed.type === 'keepalive') {
      this.write(encodeKeepaliveResponse()).catch(err =>
        console.log(`[BLE] Keepalive response failed: ${err.message}`)
      );
      return;
    }

    this.emit('data', parsed);
  }

  // ── Reconnection ────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (this._shuttingDown) return;
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
      return JSON.parse(fs.readFileSync(this._config.knownDeviceFile, 'utf8'));
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

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = BleConnection;
