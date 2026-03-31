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
- Unsolicited responses (no pending message required)
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
MQTT_USERNAME=your-user
MQTT_PASSWORD=your-pass

# Weather - OpenWeatherMap (https://openweathermap.org/api)
OWM_API_KEY=your-owm-key
OWM_LAT=55.6761
OWM_LON=12.5683

# Air Quality - WAQI (https://aqicn.org/data-platform/token/)
WAQI_TOKEN=your-waqi-token
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

### 3. Lovelace Card

Copy `dist/kwatch-message-card.js` to your HA's `www/` directory, then add it as a resource:

**Settings > Dashboards > Resources > Add Resource:**
- URL: `/local/kwatch-message-card.js?v=1`
- Type: JavaScript Module

When updating the card file, increment the `?v=` parameter to bust the cache.

Add the card to a dashboard (Edit > Add Card > Manual):

```yaml
type: custom:kwatch-message-card
response_entity: sensor.k_watch_last_response
battery_entity: sensor.k_watch_battery
connection_entity: binary_sensor.k_watch_connection
```

Note: check the exact entity IDs in Developer Tools > States, as HA may adjust them.

The card provides:
- **Send** - Send a text message to the watch
- **Buzz** - Vibrate the watch
- **Weather** - Sync 6-day weather forecast + air quality to the watch
- **Time** - Sync current time to the watch
- **Clear** - Clear message history
- Message history with response badges (green/red/yellow/gray)
- Connection status indicator and battery level

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

## MQTT State Topics

| Topic | Retained | Description |
|-------|----------|-------------|
| `kwatch/bridge/status` | Yes | Bridge online/offline (LWT) |
| `kwatch/device/connection` | Yes | Watch BLE connection status |
| `kwatch/device/battery` | Yes | Battery level + charging state |
| `kwatch/device/event` | No | Watch button events |
| `kwatch/message/last` | Yes | Last message + response |
| `kwatch/message/history` | Yes | Last 50 messages |

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
- OpenWeatherMap API key (free tier) for weather sync
- WAQI API token (free) for air quality data

## License

MIT
