# K-Watch Messenger

A two-way messaging system using a [K-WATCH](https://github.com/jkiddo/watch) BLE fitness tracker and Home Assistant.

Send text messages from Home Assistant's web UI to the watch. The watch wearer responds using button actions:

- **"Take Photo" button** = **OK - got it**
- **"Find Device" button** = **No**

Responses can also be sent unsolicited from the watch at any time.

## Architecture

```
K-WATCH  <--BLE-->  Bridge (Node.js)  <--MQTT-->  Home Assistant
                                                      └── Lovelace card
```

The bridge runs on a machine with a compatible Bluetooth adapter (macOS recommended) and communicates with HA via MQTT. HA entities are created automatically via MQTT auto-discovery.

## Features

- Send text messages to the watch from the HA dashboard
- Receive OK/No responses from the watch wearer
- Unsolicited event detection with configurable timeout and phone notifications
- Heart rate monitoring (background, on-demand, and multi-sensor)
- 6-day weather forecast sync (OpenWeatherMap + WAQI air quality)
- Time sync (with DST support)
- Vibrate/buzz the watch remotely
- Battery level monitoring
- Connection status tracking
- Message history (last 50 messages, persisted across restarts)
- Auto-reconnect on BLE disconnect

## Setup

### 1. Bridge

```bash
cd bridge
cp .env.example .env
# Edit .env with your MQTT credentials, location, and API keys
npm install
node index.js
```

The `.env` file configures all credentials and settings:

```env
# MQTT
MQTT_BROKER=mqtt://homeassistant.local:1883
MQTT_USERNAME=kwatch
MQTT_PASSWORD=changeme

# Weather - OpenWeatherMap (https://openweathermap.org/api)
OWM_API_KEY=4711db55c096a5f06189cf465db54e51
OWM_LAT=56.1629
OWM_LON=10.2039

# Air Quality - WAQI (https://aqicn.org/data-platform/token/)
WAQI_TOKEN=0b94731c9428eccb6a21ca9ab52a58bf6a3f8995
```

The bridge will scan for a K-WATCH, connect, and start publishing state to MQTT. It auto-reconnects on disconnect and persists the known device across restarts.

### 2. Home Assistant

**Prerequisites:** MQTT integration must be configured in HA, connected to the same broker.

Once the bridge is running, HA auto-discovers these entities:

| Entity | Type | Description |
|--------|------|-------------|
| `sensor.kwatch_battery` | Sensor | Battery level (%) |
| `binary_sensor.kwatch_connection` | Binary Sensor | BLE connection status |
| `sensor.kwatch_last_response` | Sensor | Last response from watch wearer |
| `sensor.kwatch_last_message` | Sensor | Last sent message text |
| `sensor.kwatch_heart_rate` | Sensor | Heart rate (bpm) |
| `number.kwatch_unsolicited_timeout` | Number | Unsolicited event timeout (min) |

### 3. Lovelace Cards

Copy both card files from `dist/` to your HA's `www/` directory, then add them as resources:

**Settings > Dashboards > Resources > Add Resource:**
- URL: `/local/kwatch-message-card.js?v=1` — Type: JavaScript Module
- URL: `/local/kwatch-heartrate-card.js?v=1` — Type: JavaScript Module

When updating card files, increment the `?v=` parameter to bust the cache.

#### Messenger Card

Send messages, vibrate, sync weather/time, and view response history.

```yaml
type: custom:kwatch-message-card
response_entity: sensor.kwatch_last_response
battery_entity: sensor.kwatch_battery
connection_entity: binary_sensor.kwatch_connection
```

- **Send** — Send a text message to the watch
- **Buzz** — Vibrate the watch
- **Weather** — Sync 6-day weather forecast + air quality
- **Time** — Sync current time
- **Clear** — Clear message history
- Message history with response badges (green/red/yellow/gray)
- Connection status indicator and battery level

#### Heart Rate Card

Displays the latest heart rate reading with a pulsing heart animation when data is fresh (< 10 min). Includes a Measure/Stop button for on-demand readings.

```yaml
type: custom:kwatch-heartrate-card
heart_rate_entity: sensor.kwatch_heart_rate
connection_entity: binary_sensor.kwatch_connection
```

Heart rate data arrives from the watch in three ways:
- **Background** — periodic auto-measurements sent via the 0x06 event byte (range 30–220)
- **On-demand** — triggered by the Measure button (command 0x14), response on 0x14
- **Multi-sensor** — combined HR/BP/SpO2/stress data on 0x24

All three are published to `kwatch/device/heart_rate` as `{"bpm": <value>, "timestamp": "..."}`.

Note: check the exact entity IDs in Developer Tools > States, as HA may adjust them.

## Unsolicited Events

When the watch wearer presses a button without a pending message (or after the configurable timeout has expired), the event is published to MQTT with `"unsolicited": true`. The timeout is controlled by the `number.kwatch_unsolicited_timeout` entity (default: 3 minutes, range: 1–30 minutes), which appears as a slider in the HA frontend.

To send a phone notification on unsolicited events, add this automation to HA:

```yaml
alias: "K-WATCH unsolicited event notification"
description: "Send phone notification when K-WATCH button is pressed without a pending message"
trigger:
  - platform: mqtt
    topic: kwatch/device/event
condition:
  - condition: template
    value_template: "{{ trigger.payload_json.unsolicited }}"
action:
  - service: notify.mobile_app_pixel_10_pro_xl
    data:
      title: "K-WATCH"
      message: >-
        {% set labels = {'ok': 'Take Photo', 'no': 'Find Phone'} %}
        {{ labels[trigger.payload_json.action] | default('Unknown') }} button pressed
```

Replace `mobile_app_pixel_10_pro_xl` with your phone's notify service (check Settings > Companion App or Developer Tools > Services).

## Sending Messages from Automations

```yaml
service: mqtt.publish
data:
  topic: kwatch/command/send_message
  payload: '{"title": "Home", "message": "Dinner is ready"}'
```

## MQTT Commands

| Topic | Payload | Description |
|-------|---------|-------------|
| `kwatch/command/send_message` | `{"title":"HA","message":"..."}` | Send message to watch |
| `kwatch/command/vibrate` | _(empty)_ | Vibrate the watch |
| `kwatch/command/sync_weather` | _(empty)_ | Fetch and sync 6-day weather |
| `kwatch/command/sync_time` | _(empty)_ | Sync current time |
| `kwatch/command/clear_history` | _(empty)_ | Clear message history |
| `kwatch/command/measure_heart_rate` | _(empty)_ | Start on-demand heart rate measurement |
| `kwatch/command/stop_heart_rate` | _(empty)_ | Stop heart rate measurement |

## MQTT State Topics

| Topic | Retained | Description |
|-------|----------|-------------|
| `kwatch/bridge/status` | Yes | Bridge online/offline (LWT) |
| `kwatch/device/connection` | Yes | Watch BLE connection status |
| `kwatch/device/battery` | Yes | Battery level + charging state |
| `kwatch/device/heart_rate` | Yes | Heart rate (`{"bpm", "timestamp"}`) |
| `kwatch/device/event` | No | Watch button events (`{"action", "unsolicited", "timestamp"}`) |
| `kwatch/message/last` | Yes | Last message + response |
| `kwatch/message/history` | Yes | Last 50 messages |
| `kwatch/config/unsolicited_timeout` | Yes | Current unsolicited timeout (minutes) |

## Automation Examples

Trigger on watch response:

```yaml
automation:
  trigger:
    platform: state
    entity_id: sensor.kwatch_last_response
    to: "No"
  action:
    - service: notify.mobile_app
      data:
        message: "Watch wearer declined"
```

Sync weather every 3 hours:

```yaml
automation:
  trigger:
    platform: time_pattern
    hours: "/3"
  action:
    - service: mqtt.publish
      data:
        topic: kwatch/command/sync_weather
```

## Bluetooth Compatibility

The K-WATCH firmware does not set the "BR/EDR Not Supported" BLE advertising flag, which causes compatibility issues:

| Platform | Status |
|----------|--------|
| **macOS** (CoreBluetooth via noble) | Works |
| **Linux** (BlueZ on HA OS) | Does not work -- BlueZ tries classic Bluetooth |
| **Raspberry Pi 3** (onboard BCM43) | Does not work -- connection drops immediately |
| **Raspberry Pi 4/5** | Untested, may work |
| **Linux + USB BLE dongle** (BT 4.0+) | Should work with a compatible adapter |

## Requirements

- Node.js 18+
- Machine with compatible Bluetooth adapter (macOS recommended)
- MQTT broker (e.g. Mosquitto) accessible from both the bridge and HA
- Home Assistant with MQTT integration configured
- K-WATCH BLE fitness tracker

## License

MIT
