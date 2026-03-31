/**
 * K-WATCH BLE protocol encoding/decoding.
 * Pure functions, no external dependencies.
 * Packet format: 20 bytes, zero-padded, little-endian multi-byte values.
 */

const PACKET_SIZE = 20;
const PAYLOAD_SIZE = 17;

const CMD_TIME_SYNC = 0x01;
const CMD_BATTERY = 0x0b;
const CMD_NOTIFICATION = 0x46;
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
  const now = Math.floor(Date.now() / 1000);
  if (tzOffsetHours === undefined) {
    tzOffsetHours = -(new Date().getTimezoneOffset() / 60);
  }
  const pkt = Buffer.alloc(PACKET_SIZE);
  pkt[0] = CMD_TIME_SYNC;
  pkt.writeUInt32LE(now, 1);
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

module.exports = {
  PACKET_SIZE,
  PAYLOAD_SIZE,
  CMD_NOTIFICATION,
  CMD_KEEPALIVE,
  encodeNotification,
  encodeTimeSync,
  encodeKeepaliveResponse,
  encodeBatteryRequest,
  parseResponse,
};
