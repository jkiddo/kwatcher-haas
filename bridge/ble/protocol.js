/**
 * K-WATCH BLE protocol encoding/decoding.
 * Pure functions, no external dependencies.
 * Packet format: 20 bytes, zero-padded, little-endian multi-byte values.
 */

const PACKET_SIZE = 20;
const PAYLOAD_SIZE = 17;

const CMD_TIME_SYNC = 0x01;
const CMD_BATTERY = 0x0b;
const CMD_NOTIFICATION = 0x12;
const CMD_KEEPALIVE = 0x3a;

const RESP_EVENT = 0x06;
const RESP_BATTERY = 0x0b;
const RESP_KEEPALIVE = 0x3a;

const EVENT_FIND_PHONE = 0x01; // "No"
const EVENT_TAKE_PHOTO = 0x02; // "OK - got it"

/**
 * Encode a notification as a multi-packet sequence.
 * @param {string} title
 * @param {string} body
 * @param {number} [typeId=1] - ANCS notification type (1=SMS)
 * @returns {Buffer[]} Array of 20-byte Buffers
 */
function encodeNotification(title, body, typeId = 1) {
  const titleBytes = utf8Truncate(title || '', PAYLOAD_SIZE);
  const bodyBytes = Buffer.from(body || '', 'utf8');

  const bodyChunks = [];
  if (bodyBytes.length === 0) {
    bodyChunks.push(Buffer.alloc(0));
  } else {
    for (let i = 0; i < bodyBytes.length; i += PAYLOAD_SIZE) {
      bodyChunks.push(bodyBytes.subarray(i, i + PAYLOAD_SIZE));
    }
  }

  const totalPackets = 2 + bodyChunks.length;
  const packets = [];

  // Packet 1: Header
  const pkt1 = Buffer.alloc(PACKET_SIZE);
  pkt1[0] = CMD_NOTIFICATION;
  pkt1[1] = totalPackets;
  pkt1[2] = 1;
  pkt1[3] = 0x00;
  pkt1[4] = typeId & 0xff;
  packets.push(pkt1);

  // Packet 2: Title
  const pkt2 = Buffer.alloc(PACKET_SIZE);
  pkt2[0] = CMD_NOTIFICATION;
  pkt2[1] = totalPackets;
  pkt2[2] = 2;
  titleBytes.copy(pkt2, 3);
  packets.push(pkt2);

  // Packets 3+: Body chunks
  for (let i = 0; i < bodyChunks.length; i++) {
    const pkt = Buffer.alloc(PACKET_SIZE);
    pkt[0] = CMD_NOTIFICATION;
    pkt[1] = totalPackets;
    pkt[2] = 3 + i;
    bodyChunks[i].copy(pkt, 3);
    packets.push(pkt);
  }

  return packets;
}

/**
 * Encode a time sync command (0x01).
 * @param {number} [tzOffsetHours] - Defaults to local timezone offset
 * @returns {Buffer}
 */
function encodeTimeSync(tzOffsetHours) {
  if (tzOffsetHours === undefined) {
    tzOffsetHours = -(new Date().getTimezoneOffset() / 60);
  }
  // The watch displays the timestamp directly without applying the offset,
  // so we send local time (UTC + offset) as the timestamp value.
  const localTimestamp = Math.floor(Date.now() / 1000) + (tzOffsetHours * 3600);
  const pkt = Buffer.alloc(PACKET_SIZE);
  pkt[0] = CMD_TIME_SYNC;
  pkt.writeUInt32LE(localTimestamp, 1);
  pkt[5] = tzOffsetHours & 0xff;
  return pkt;
}

/** @returns {Buffer} */
function encodeKeepaliveResponse() {
  const pkt = Buffer.alloc(PACKET_SIZE);
  pkt[0] = CMD_KEEPALIVE;
  return pkt;
}

/** @returns {Buffer} */
function encodeBatteryRequest() {
  const pkt = Buffer.alloc(PACKET_SIZE);
  pkt[0] = CMD_BATTERY;
  return pkt;
}

/**
 * Parse a response from the device.
 * @param {Buffer} data
 * @returns {{ type: string, [key: string]: any }}
 */
function parseResponse(data) {
  if (!data || data.length < 2) {
    return { type: 'unknown' };
  }

  const respId = data[0];

  if (respId === RESP_EVENT) {
    const eventCode = data[1];
    if (eventCode === EVENT_TAKE_PHOTO) return { type: 'event', eventCode, action: 'ok' };
    if (eventCode === EVENT_FIND_PHONE) return { type: 'event', eventCode, action: 'no' };
    return { type: 'event', eventCode, action: 'other' };
  }

  if (respId === RESP_BATTERY) {
    return { type: 'battery', level: data[1], charging: !!data[2] };
  }

  if (respId === RESP_KEEPALIVE) {
    return { type: 'keepalive' };
  }

  return { type: 'unknown' };
}

/**
 * Truncate a string to maxBytes of UTF-8, safe at character boundaries.
 * @param {string} text
 * @param {number} maxBytes
 * @returns {Buffer}
 */
function utf8Truncate(text, maxBytes) {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return buf;
  // Truncate and re-encode to avoid splitting multi-byte chars
  let truncated = buf.subarray(0, maxBytes);
  const str = truncated.toString('utf8').replace(/\uFFFD$/, '');
  return Buffer.from(str, 'utf8');
}

// OpenWeatherMap condition ID → watch weather type
const OWM_TO_WATCH = {
  200: 21, 201: 21, 202: 22, 210: 21, 211: 21, 212: 22, 221: 22, 230: 7, 231: 7, 232: 7,
  300: 4, 301: 4, 302: 4, 310: 4, 311: 4, 312: 5, 313: 5, 314: 6, 321: 4,
  500: 5, 501: 5, 502: 6, 503: 6, 504: 6, 511: 11, 520: 5, 521: 5, 522: 6, 531: 6,
  600: 8, 601: 9, 602: 10, 611: 11, 612: 11, 613: 11, 615: 11, 616: 11, 620: 8, 621: 9, 622: 10,
  701: 12, 711: 15, 721: 12, 731: 15, 741: 12, 751: 15, 761: 15, 762: 15, 771: 17, 781: 20,
  800: 1,
  801: 3, 802: 3, 803: 3, 804: 3,
};

/**
 * Encode a weather update for the watch. Command 0x22.
 * @param {object} w
 * @param {number} w.temp - Current temperature (°C)
 * @param {number} w.tempMin - Min temperature (°C)
 * @param {number} w.tempMax - Max temperature (°C)
 * @param {number} [w.conditionId=800] - OpenWeatherMap condition ID
 * @param {number} [w.uvIndex=0] - UV index
 * @param {number} [w.pm25=0] - PM2.5 (µg/m³)
 * @param {number} [w.aqi=0] - Air Quality Index
 * @param {number} [w.index=0] - Day index (0=today, 1-4=forecast)
 * @returns {Buffer}
 */
function encodeWeather(w) {
  const ts = Math.floor(Date.now() / 1000);
  const weatherType = OWM_TO_WATCH[w.conditionId] || 0;
  const curTemp = Math.round(w.temp || 0);
  const minTemp = Math.round(w.tempMin || 0);
  const maxTemp = Math.round(w.tempMax || 0);
  const uvIndex = Math.round(w.uvIndex || 0);
  const pm25 = Math.round(w.pm25 || 0);
  const aqi = Math.round(w.aqi || 0);

  const pkt = Buffer.alloc(PACKET_SIZE);
  pkt[0] = 0x22;
  pkt[1] = (w.index || 0) & 0xff;
  pkt.writeUInt32LE(ts, 2);
  pkt.writeUInt16LE(weatherType, 6);      // daytime weather
  pkt.writeUInt16LE(weatherType, 8);      // nighttime weather
  pkt[10] = minTemp & 0xff;
  pkt[11] = maxTemp & 0xff;
  pkt[12] = 0;                            // air quality category (0-5)
  pkt.writeUInt16LE(pm25, 13);
  pkt[15] = uvIndex & 0xff;
  pkt.writeUInt16LE(aqi, 16);
  pkt[18] = curTemp & 0xff;
  return pkt;
}

/**
 * Encode a vibration command. Sends both 0x05 (trigger lost) and 0x04 (vibrate).
 * @param {number} [intensity=10] - Vibration intensity (0-10)
 * @returns {Buffer[]} Two 20-byte Buffers to send sequentially
 */
function encodeVibrate(intensity = 10) {
  const pkt1 = Buffer.alloc(PACKET_SIZE);
  pkt1[0] = 0x05;
  pkt1[1] = intensity & 0xff;
  const pkt2 = Buffer.alloc(PACKET_SIZE);
  pkt2[0] = 0x04;
  pkt2[1] = intensity & 0xff;
  return [pkt1, pkt2];
}

module.exports = {
  PACKET_SIZE,
  PAYLOAD_SIZE,
  CMD_NOTIFICATION,
  CMD_KEEPALIVE,
  encodeNotification,
  encodeTimeSync,
  encodeKeepaliveResponse,
  encodeBatteryRequest,
  encodeWeather,
  encodeVibrate,
  parseResponse,
};
