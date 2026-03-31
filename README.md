# K-Watch Messenger

A two-way messaging system using a [K-WATCH](https://github.com/jkiddo/watch) BLE fitness tracker and Home Assistant.

Send text messages from Home Assistant's web UI to the watch. The watch wearer responds using button actions:

- **"Take Photo" button** = **OK - got it**
- **"Find Device" button** = **No**

## Architecture

```
K-WATCH  <--BLE-->  Raspberry Pi (Node.js bridge)  <--MQTT-->  Home Assistant
                                                                  └── Lovelace card
```

The bridge runs on a dedicated Raspberry Pi with Raspbian and communicates with HA via MQTT. HA entities are created automatically via MQTT auto-discovery.

## Setup

### 1. Raspberry Pi (BLE Bridge)

On a Raspberry Pi running Raspbian:

```bash
git clone https://github.com/jkiddo/kwatcher-haas.git
cd kwatcher-haas/bridge
bash install.sh
```

Edit the MQTT credentials:

```bash
sudo systemctl edit kwatch-bridge
```

Add:

```ini
[Service]
Environment=MQTT_BROKER=mqtt://your-ha-ip:1883
Environment=MQTT_USERNAME=your-user
Environment=MQTT_PASSWORD=your-pass
```

Start the service:

```bash
sudo systemctl start kwatch-bridge
sudo journalctl -u kwatch-bridge -f
```

The bridge will scan for a K-WATCH, connect, and start publishing state to MQTT. It auto-reconnects on disconnect.

### 2. Home Assistant

**Prerequisites:** MQTT integration must be configured in HA, connected to the same broker.

Once the bridge is running, HA auto-discovers these entities:

| Entity | Type | Description |
|--------|------|-------------|
| `sensor.kwatch_battery` | Sensor | Battery level (%) |
| `binary_sensor.kwatch_connection` | Binary Sensor | BLE connection status |
| `sensor.kwatch_last_response` | Sensor | Last response from watch wearer |

### 3. Lovelace Card

Copy `dist/kwatch-message-card.js` to your HA's `www/` directory, then add it as a resource:

**Settings > Dashboards > Resources > Add Resource:**
- URL: `/local/kwatch-message-card.js`
- Type: JavaScript Module

Add the card to a dashboard (Edit > Add Card > Manual):

```yaml
type: custom:kwatch-message-card
response_entity: sensor.kwatch_last_response
battery_entity: sensor.kwatch_battery
connection_entity: binary_sensor.kwatch_connection
```

## Sending Messages

### From the Lovelace card

Type a message and hit Send. The card publishes to MQTT automatically.

### From automations

```yaml
service: mqtt.publish
data:
  topic: kwatch/command/send_message
  payload: '{"title": "Home", "message": "Dinner is ready"}'
```

### From Developer Tools

Go to Developer Tools > Services, select `mqtt.publish`, and enter the topic and payload above.

## Automation Events

Use the `sensor.kwatch_last_response` entity in automations:

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

## MQTT Topics

| Topic | Direction | Description |
|-------|-----------|-------------|
| `kwatch/bridge/status` | Bridge→HA | Bridge online/offline (LWT) |
| `kwatch/device/connection` | Bridge→HA | Watch BLE connection status |
| `kwatch/device/battery` | Bridge→HA | Battery level + charging state |
| `kwatch/device/event` | Bridge→HA | Watch button events |
| `kwatch/message/last` | Bridge→HA | Last message + response |
| `kwatch/message/history` | Bridge→HA | Last 50 messages (retained) |
| `kwatch/command/send_message` | HA→Bridge | Send a message to the watch |

## Configuration

The bridge is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MQTT_BROKER` | `mqtt://homeassistant.local:1883` | MQTT broker URL |
| `MQTT_USERNAME` | | MQTT username |
| `MQTT_PASSWORD` | | MQTT password |
| `DEVICE_NAME` | `K-WATCH` | BLE advertised name to scan for |
| `MESSAGE_TIMEOUT` | `120` | Seconds before marking "No response" |
| `BATTERY_POLL_INTERVAL` | `300` | Seconds between battery polls |

## How It Works

The K-WATCH uses a proprietary BLE protocol over a custom GATT service. Messages are sent as multi-packet notification sequences (command `0x46`). When the wearer presses a button, the watch sends an event back:

- Event code `0x02` (Take Photo) = **OK - got it**
- Event code `0x01` (Find Device) = **No**

The bridge responds to keepalive pings (`0x3A`) to maintain the connection.

## Requirements

- Raspberry Pi with Raspbian and Bluetooth
- Node.js 20+
- MQTT broker (e.g. Mosquitto) accessible from both the Pi and HA
- Home Assistant with MQTT integration configured
- K-WATCH BLE fitness tracker

## License

MIT
