/**
 * Home Assistant MQTT auto-discovery config payloads.
 */

function publishDiscovery(mqtt, config) {
  const base = config.mqttBaseTopic;

  const device = {
    identifiers: ['kwatch_bridge'],
    name: 'K-WATCH',
    manufacturer: 'Keeprapid',
    model: 'K-WATCH',
  };

  const availability = [
    { topic: `${base}/bridge/status` },
  ];

  // Battery sensor
  mqtt.publishAbsolute('homeassistant/sensor/kwatch_battery/config', JSON.stringify({
    name: 'Battery',
    unique_id: 'kwatch_battery',
    device_class: 'battery',
    unit_of_measurement: '%',
    state_topic: `${base}/device/battery`,
    value_template: '{{ value_json.level }}',
    json_attributes_topic: `${base}/device/battery`,
    availability,
    device,
  }));

  // Connection binary sensor
  mqtt.publishAbsolute('homeassistant/binary_sensor/kwatch_connection/config', JSON.stringify({
    name: 'Connection',
    unique_id: 'kwatch_connection',
    device_class: 'connectivity',
    state_topic: `${base}/device/connection`,
    payload_on: 'online',
    payload_off: 'offline',
    availability,
    device,
  }));

  // Last Response sensor
  mqtt.publishAbsolute('homeassistant/sensor/kwatch_last_response/config', JSON.stringify({
    name: 'Last Response',
    unique_id: 'kwatch_last_response',
    icon: 'mdi:message-reply-text',
    state_topic: `${base}/message/last`,
    value_template: '{{ value_json.response | default("Idle", true) }}',
    json_attributes_topic: `${base}/message/history`,
    json_attributes_template: '{{ {"message_history": value_json} | tojson }}',
    availability,
    device,
  }));

  // Last Message sensor (shows the sent message text)
  mqtt.publishAbsolute('homeassistant/sensor/kwatch_last_message/config', JSON.stringify({
    name: 'Last Message',
    unique_id: 'kwatch_last_message',
    icon: 'mdi:message-text-outline',
    state_topic: `${base}/message/last`,
    value_template: '{{ value_json.message | default("", true) }}',
    json_attributes_topic: `${base}/message/last`,
    availability,
    device,
  }));

  // Heart rate sensor
  mqtt.publishAbsolute('homeassistant/sensor/kwatch_heart_rate/config', JSON.stringify({
    name: 'Heart Rate',
    unique_id: 'kwatch_heart_rate',
    icon: 'mdi:heart-pulse',
    state_topic: `${base}/device/heart_rate`,
    value_template: '{{ value_json.bpm }}',
    json_attributes_topic: `${base}/device/heart_rate`,
    unit_of_measurement: 'bpm',
    availability,
    device,
  }));

  // Unsolicited event timeout (configurable from HA frontend)
  mqtt.publishAbsolute('homeassistant/number/kwatch_unsolicited_timeout/config', JSON.stringify({
    name: 'Unsolicited Event Timeout',
    unique_id: 'kwatch_unsolicited_timeout',
    icon: 'mdi:timer-outline',
    command_topic: `${base}/config/unsolicited_timeout/set`,
    state_topic: `${base}/config/unsolicited_timeout`,
    min: 1,
    max: 30,
    step: 1,
    unit_of_measurement: 'min',
    mode: 'slider',
    availability,
    device,
  }));

  console.log('[MQTT] Published HA auto-discovery configs');
}

module.exports = { publishDiscovery };
