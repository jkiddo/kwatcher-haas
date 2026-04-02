/**
 * MQTT client wrapper with LWT and topic management.
 */

const EventEmitter = require('events');
const mqtt = require('mqtt');

class MqttBridge extends EventEmitter {
  constructor(config) {
    super();
    this._config = config;
    this._client = null;
  }

  get _baseTopic() {
    return this._config.mqttBaseTopic;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const opts = {
        clientId: 'kwatch-bridge',
        will: {
          topic: `${this._baseTopic}/bridge/status`,
          payload: 'offline',
          retain: true,
          qos: 1,
        },
      };
      if (this._config.mqttUsername) opts.username = this._config.mqttUsername;
      if (this._config.mqttPassword) opts.password = this._config.mqttPassword;

      console.log(`[MQTT] Connecting to ${this._config.mqttBroker}...`);
      this._client = mqtt.connect(this._config.mqttBroker, opts);

      const timeout = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('MQTT connection timeout')); }
      }, 10000);

      this._client.once('connect', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.log('[MQTT] Connected');
        this._client.publish(
          `${this._baseTopic}/bridge/status`, 'online', { retain: true }
        );
        this._client.subscribe([
          `${this._baseTopic}/command/#`,
          `${this._baseTopic}/config/+/set`,
        ], (err) => {
          if (err) console.error(`[MQTT] Subscribe error: ${err.message}`);
        });
        resolve();
      });

      this._client.on('message', (topic, payload) => {
        this.emit('command', topic, payload);
      });

      this._client.on('error', (err) => {
        console.error(`[MQTT] Error: ${err.message}`);
        if (!settled) { settled = true; clearTimeout(timeout); reject(err); }
      });

      this._client.on('offline', () => {
        console.log('[MQTT] Offline');
      });

      this._client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
      });
    });
  }

  publish(subTopic, payload) {
    if (!this._client) return;
    this._client.publish(`${this._baseTopic}/${subTopic}`, payload);
  }

  publishRetained(subTopic, payload) {
    if (!this._client) return;
    this._client.publish(`${this._baseTopic}/${subTopic}`, payload, { retain: true });
  }

  publishAbsolute(topic, payload) {
    if (!this._client) return;
    this._client.publish(topic, payload, { retain: true });
  }

  disconnect() {
    if (this._client) {
      this._client.end();
      this._client = null;
    }
  }
}

module.exports = MqttBridge;
