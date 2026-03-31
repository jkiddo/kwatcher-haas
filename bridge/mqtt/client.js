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
    this._baseTopic = config.mqttBaseTopic;
  }

  async connect() {
    return new Promise((resolve, reject) => {
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

      this._client.on('connect', () => {
        console.log('[MQTT] Connected');
        this._client.publish(
          `${this._baseTopic}/bridge/status`, 'online', { retain: true }
        );

        // Subscribe to command topics
        this._client.subscribe(`${this._baseTopic}/command/#`, (err) => {
          if (err) console.error(`[MQTT] Subscribe error: ${err.message}`);
        });
        resolve();
      });

      this._client.on('message', (topic, payload) => {
        this.emit('command', topic, payload);
      });

      this._client.on('error', (err) => {
        console.error(`[MQTT] Error: ${err.message}`);
      });

      this._client.on('offline', () => {
        console.log('[MQTT] Offline');
      });

      this._client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
      });

      // Timeout for initial connection
      setTimeout(() => reject(new Error('MQTT connection timeout')), 10000);
    });
  }

  /**
   * Publish to a topic under the base topic.
   * @param {string} subTopic - Topic suffix (e.g. "device/battery")
   * @param {string} payload
   */
  publish(subTopic, payload) {
    if (!this._client) return;
    this._client.publish(`${this._baseTopic}/${subTopic}`, payload);
  }

  /**
   * Publish with retain flag.
   * @param {string} subTopic
   * @param {string} payload
   */
  publishRetained(subTopic, payload) {
    if (!this._client) return;
    this._client.publish(`${this._baseTopic}/${subTopic}`, payload, { retain: true });
  }

  /**
   * Publish to an absolute topic (for HA discovery).
   * @param {string} topic
   * @param {string} payload
   */
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
