"""Constants for the K-Watch Messenger integration."""

DOMAIN = "kwatch"

# BLE GATT UUIDs
SERVICE_UUID = "000056ff-0000-1000-8000-00805f9b34fb"
TX_CHAR_UUID = "000033f3-0000-1000-8000-00805f9b34fb"  # Phone → Device (write)
RX_CHAR_UUID = "000033f4-0000-1000-8000-00805f9b34fb"  # Device → Phone (notify)

# Protocol command IDs
CMD_TIME_SYNC = 0x01
CMD_BATTERY = 0x0B
CMD_NOTIFICATION = 0x46
CMD_KEEPALIVE = 0x3A

# Response IDs
RESP_EVENT = 0x06
RESP_BATTERY = 0x0B
RESP_KEEPALIVE = 0x3A

# Device event codes (byte 1 of 0x06 response)
EVENT_FIND_PHONE = 0x01  # Watch wearer says "No"
EVENT_TAKE_PHOTO = 0x02  # Watch wearer says "OK - got it"

# Notification type IDs (ANCS-style)
NOTIF_TYPE_SMS = 1

# Response labels
RESPONSE_OK = "OK - got it"
RESPONSE_NO = "No"
RESPONSE_PENDING = "Pending"
RESPONSE_TIMEOUT = "No response"
RESPONSE_IDLE = "Idle"

# Connection states
STATE_CONNECTED = "Connected"
STATE_DISCONNECTED = "Disconnected"

# Default notification title
DEFAULT_NOTIFICATION_TITLE = "HA"

# Timing
DEFAULT_MESSAGE_TIMEOUT = 120  # seconds
RECONNECT_BASE_DELAY = 5  # seconds
RECONNECT_MAX_DELAY = 300  # seconds
INTER_PACKET_DELAY = 0.05  # 50ms between multi-packet writes

# BLE packet size
PACKET_SIZE = 20
PACKET_PAYLOAD_SIZE = 17  # bytes available for data per notification packet

# Config entry keys
CONF_DEVICE_ADDRESS = "device_address"
CONF_DEVICE_NAME = "device_name"
CONF_MESSAGE_TIMEOUT = "message_timeout"

# Max message history entries
MAX_HISTORY_ENTRIES = 50
