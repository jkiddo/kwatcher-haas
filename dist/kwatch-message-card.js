/**
 * K-Watch Messenger - Custom Lovelace Card (MQTT version)
 *
 * Send messages to a K-WATCH via MQTT and view responses.
 */

const RESPONSE_OK = "OK - got it";
const RESPONSE_NO = "No";
const RESPONSE_TIMEOUT = "No response";
const DEFAULT_TITLE = "HA";
const DEFAULT_TOPIC_PREFIX = "kwatch/command";

const NOTIFICATION_APPS = [
  { id: 'sms', label: 'SMS', color: '#2196F3',
    svg: '<path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-3 10H7v-2h10v2zm0-3H7V7h10v2z"/>' },
  { id: 'phone', label: 'Phone', color: '#4CAF50',
    svg: '<path d="M6.6 10.8a15.3 15.3 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.6 3.6a1 1 0 0 1-.3 1L6.6 10.8z"/>' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366',
    svg: '<path d="M12 2a10 10 0 0 0-8.6 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.3-.5 0-.9.2-3-1-2.5-1.4-4-4-4.2-4.2-.1-.2-1-1.4-1-2.6 0-1.2.7-1.8.9-2a.9.9 0 0 1 .7-.3h.5c.2 0 .4 0 .6.5s.8 2 .8 2.1a.5.5 0 0 1 0 .5 1.8 1.8 0 0 1-.3.5c-.2.2-.3.3-.5.5-.2.2-.4.4-.2.8s.9 1.5 1.9 2.4a8.7 8.7 0 0 0 2.8 1.5c.4.2.6.1.8-.1s1-1.1 1.2-1.5.5-.3.8-.2 2 1 2.4 1.1.6.3.7.4a3 3 0 0 1-.3 1.6z"/>' },
  { id: 'telegram', label: 'Telegram', color: '#0088cc',
    svg: '<path d="M9.8 18.3l.4-5.7 7.8-7c.3-.3 0-.5-.5-.2L7.8 13.4 2.3 11.7c-1.2-.3-1.2-1.2.3-1.7l19.8-7.6c1-.4 1.9.2 1.5 1.8L20.5 18.3c-.2 1.1-1 1.4-2 .9l-5.5-4-2.6 2.5c-.3.3-.6.6-.6.6z"/>' },
  { id: 'facebook', label: 'Facebook', color: '#1877F2',
    svg: '<path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9v-3h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 3h-2.4v7A10 10 0 0 0 22 12z"/>' },
  { id: 'instagram', label: 'Instagram', color: '#E4405F',
    svg: '<rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.5"/>' },
  { id: 'twitter', label: 'X / Twitter', color: '#000000',
    svg: '<path d="M18.9 3h3.2l-7 8 8.2 11h-6.4l-5-6.6L6.2 22H3l7.5-8.6L2.7 3h6.6l4.6 6L18.9 3zM17.8 20h1.8L8 4.8H6L17.8 20z"/>' },
  { id: 'gmail', label: 'Gmail', color: '#EA4335',
    svg: '<path d="M2 6l10 7L22 6v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 6l-10 7L2 6" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2',
    svg: '<path d="M4.98 3.5a2.49 2.49 0 1 1 0 4.98 2.49 2.49 0 0 1 0-4.98zM3 10h4v11H3V10zm7.5 0H14v1.6h.1a3.8 3.8 0 0 1 3.4-1.9c3.6 0 4.3 2.4 4.3 5.5V21h-4v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V10z"/>' },
  { id: 'snapchat', label: 'Snapchat', color: '#FFFC00',
    svg: '<path d="M12 2c2.7 0 4.5 1.3 5.2 3.8.3 1 .2 2.7.1 3.8h.3c.7 0 1.4.5 1.4 1s-.6 1-1.3 1.1c.3 1.3 2 2.7 3.3 3.2.3.1.5.4.4.7-.2.5-1 .8-2.5 1-.1.2-.2.6-.3 1-.1.3-.4.5-.7.4a7.6 7.6 0 0 0-2.4-.4c-1.8 0-2.7 1.4-3.5 2.1-.4.4-.7.5-1 .5s-.6-.1-1-.5C9.3 19 8.4 17.6 6.6 17.6a7.6 7.6 0 0 0-2.4.4.7.7 0 0 1-.7-.4c-.1-.4-.2-.8-.3-1-1.5-.2-2.3-.5-2.5-1a.6.6 0 0 1 .4-.7c1.3-.5 3-1.9 3.3-3.2-.7-.1-1.3-.5-1.3-1.1s.7-1 1.4-1h.3c-.1-1.1-.2-2.8.1-3.8C5.6 3.3 9.3 2 12 2z" stroke="#ccc" stroke-width=".5"/>' },
  { id: 'skype', label: 'Skype', color: '#00AFF0',
    svg: '<path d="M12 2a10 10 0 0 0-7 17 6.3 6.3 0 0 0 8.5 3 10 10 0 0 0 8.5-15A6.3 6.3 0 0 0 12 2zm.3 14.5c-3 0-4.4-1.5-4.4-2.6a1 1 0 0 1 1.1-1c1.4 0 1 2 3.3 2 1.2 0 1.8-.6 1.8-1.3 0-.4-.2-.8-1-1l-3.3-.8c-2.6-.6-3.1-2-3.1-3.3 0-2.7 2.5-3.5 4.5-3.5s4 1 4 2.4a1 1 0 0 1-1.1 1c-1.2 0-1-.8-2.8-1.5-1 0-1.7.4-1.7 1.2 0 .7.8.9 1.6 1.1l2.5.5c2.7.6 3.3 2 3.3 3.4 0 2.2-1.7 3.6-4.7 3.4z"/>' },
  { id: 'line', label: 'LINE', color: '#00C300',
    svg: '<path d="M22 10.6C22 5.8 17.5 2 12 2S2 5.8 2 10.6c0 4.3 3.8 7.8 8.9 8.5.3.1.8.2.9.5s.2.8.1 1.1l-.1.7c-.1.4-.3 1.4 1.2.8s8-4.7 10.9-8a7.6 7.6 0 0 0-1.9-3.6zM8.5 13.2H6.3a.5.5 0 0 1-.5-.5V9a.5.5 0 0 1 1 0v3.2h1.7a.5.5 0 0 1 0 1zm2-.5a.5.5 0 0 1-1 0V9a.5.5 0 0 1 1 0v3.7zm4.3 0a.5.5 0 0 1-.4.5.5.5 0 0 1-.4-.2l-2.2-3v2.7a.5.5 0 0 1-1 0V9a.5.5 0 0 1 .5-.5.5.5 0 0 1 .4.2l2.1 3V9a.5.5 0 0 1 1 0v3.7zm3.2-1.5a.5.5 0 0 1 0 1H16.3v.8H18a.5.5 0 0 1 0 1h-2.2a.5.5 0 0 1-.5-.5V9a.5.5 0 0 1 .5-.5H18a.5.5 0 0 1 0 1h-1.7v.7H18z"/>' },
  { id: 'kakaotalk', label: 'KakaoTalk', color: '#FAE100',
    svg: '<path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.8-.2.7-.6 2.5-.7 2.9-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.6.1 1.2.1 1.8.1 5.5 0 10-3.6 10-8s-4.5-7.6-10-7.6z" stroke="#3C1E1E" stroke-width=".5"/>' },
  { id: 'viber', label: 'Viber', color: '#7360F2',
    svg: '<path d="M19.8 5.8a11.7 11.7 0 0 0-8-3.7c0 0-6.6-.5-9.2 4a11 11 0 0 0-.9 5.1v.1c.1 1.9.7 3.5 1.7 4.7.2.2.3.5.3.8l-.4 3a1 1 0 0 0 1.2 1.1l2.8-.7a1 1 0 0 1 .6 0 12 12 0 0 0 3.7.6h.3c3.3 0 6.2-1.3 8-3.7a8.6 8.6 0 0 0 1.6-5.4 8.5 8.5 0 0 0-1.7-6.9zm-3.6 9.7a2.4 2.4 0 0 1-1.3 1.1c-.4.2-.8.2-1.2.1a14 14 0 0 1-4-2.2 10 10 0 0 1-2.5-3 5.2 5.2 0 0 1-.7-2.3A2.2 2.2 0 0 1 8 7.5a1.6 1.6 0 0 1 1.1-.4h.4c.3 0 .5.1.7.6l.8 2c.2.3.1.6-.1.9l-.5.5c-.2.2-.2.4 0 .7a8.5 8.5 0 0 0 1.7 2 7 7 0 0 0 2.2 1.2c.3.1.5.1.7-.1l.5-.6c.2-.3.5-.4.8-.2l1.9 1c.3.1.5.3.5.6a2.7 2.7 0 0 1-.5 1.8z"/><path d="M13.8 7.5a3.8 3.8 0 0 1 2.7 3.5.5.5 0 0 1-1 0 2.8 2.8 0 0 0-2-2.6.5.5 0 1 1 .3-1zm.8-1.7a5.5 5.5 0 0 1 4 5.3.5.5 0 0 1-1 0 4.5 4.5 0 0 0-3.3-4.3.5.5 0 0 1 .3-1z"/>' },
  { id: 'pinterest', label: 'Pinterest', color: '#E60023',
    svg: '<path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.1-2 0-2.9l.8-3.3s-.2-.4-.2-1c0-1 .6-1.7 1.3-1.7.6 0 .9.5.9 1 0 .6-.4 1.5-.6 2.3-.2.7.3 1.3 1 1.3 1.3 0 2.3-1.4 2.3-3.3 0-1.7-1.2-2.9-3-2.9a3.4 3.4 0 0 0-3.5 3.4c0 .7.3 1.4.6 1.8.1.1.1.2 0 .3l-.2.8c0 .2-.1.2-.3.1-1-.4-1.5-1.8-1.5-3 0-2.4 1.7-4.6 5-4.6 2.7 0 4.7 1.9 4.7 4.4 0 2.6-1.7 4.8-4 4.8-.8 0-1.5-.4-1.8-.9l-.5 1.9c-.2.7-.7 1.6-1 2.2A10 10 0 1 0 12 2z"/>' },
  { id: 'wechat', label: 'WeChat', color: '#07C160',
    svg: '<path d="M8.5 6C4.9 6 2 8.5 2 11.5a5 5 0 0 0 2 3.8l-.5 1.8 2.1-1a7.5 7.5 0 0 0 2.9.5c.2 0 .3 0 .5-.1a4.5 4.5 0 0 1-.1-1c0-3.3 3-6 6.6-6h.5C15.4 7.3 12.2 6 8.5 6z"/><circle cx="6" cy="10.5" r=".8"/><circle cx="10" cy="10.5" r=".8"/><path d="M22 15c0-2.8-2.8-5-6-5s-6 2.2-6 5 2.8 5 6 5a7 7 0 0 0 2.4-.4l1.7.9-.4-1.5A4.5 4.5 0 0 0 22 15z"/><circle cx="14" cy="14.5" r=".7" fill="#07C160" stroke="#fff"/><circle cx="18" cy="14.5" r=".7" fill="#07C160" stroke="#fff"/>' },
  { id: 'qq', label: 'QQ', color: '#12B7F5',
    svg: '<path d="M12 2C8.7 2 6 4.3 6 7.5V11l-1.5 4.5c-.2.7.2 1 .7.8l1-.4c.3 1.4 1.6 2.7 3.3 3.3l-.7.5c-.4.3-.3.8.3.9 1 .2 2 .2 2.9.2s1.9 0 2.9-.2c.6-.1.7-.6.3-.9l-.7-.5c1.7-.6 3-1.9 3.3-3.3l1 .4c.5.2.9-.1.7-.8L18 11V7.5C18 4.3 15.3 2 12 2z"/><circle cx="9.5" cy="8" r="1.2" fill="#fff"/><circle cx="9.5" cy="8" r=".6"/><circle cx="14.5" cy="8" r="1.2" fill="#fff"/><circle cx="14.5" cy="8" r=".6"/>' },
  { id: 'dingding', label: 'DingTalk', color: '#3296FA',
    svg: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.5 11.8l-2.7.5.9 2.8c.1.3-.1.5-.4.4l-2.5-1.2-1.6 2c-.2.2-.5.1-.5-.2l.1-3.1-3.6-1.4c-.3-.1-.3-.5 0-.6l9.8-4.3c.3-.1.6.2.5.5l-1.4 4.6c0 .2.1.3.3.3l1.2-.1c.2 0 .3.2.2.4z"/>' },
  { id: 'weibo', label: 'Weibo', color: '#E6162D',
    svg: '<path d="M10.1 13.5c-2 .2-3.5 1.4-3.3 2.7s1.9 2.1 4 1.9 3.5-1.4 3.3-2.7-2-2.1-4-1.9z"/><path d="M16.2 4.8a4.3 4.3 0 0 0-4.4.5c-.4.3-.3.6.1.7a3.4 3.4 0 0 1 3.5-.2 3.2 3.2 0 0 1 1.5 3.2c-.1.4.2.6.5.4a4.2 4.2 0 0 0-1.2-4.6z"/><path d="M18.5 3.5A6.5 6.5 0 0 0 12 4.3c-.5.3-.3.8.2.8a5.3 5.3 0 0 1 5.3-.3 5 5 0 0 1 2.3 5c-.1.5.2.7.6.5a6.4 6.4 0 0 0-1.9-6.8z"/><path d="M10.5 10c-3.8.2-6.8 2.5-6.5 5.2s3.5 4.6 7.3 4.4 6.8-2.5 6.5-5.2-3.5-4.6-7.3-4.4z" fill="none" stroke="#E6162D" stroke-width="1.2"/>' },
  { id: 'tumblr', label: 'Tumblr', color: '#35465C',
    svg: '<path d="M15.5 18.5c-.7.3-1.4.5-2 .5-1.5 0-2-.7-2-1.8v-5.7h3V9h-3V5h-2.3a.2.2 0 0 0-.2.2A5.3 5.3 0 0 1 6 9v2.5h2V17c0 2.7 1.8 4 4.3 4a6 6 0 0 0 3.2-1v-1.5z"/>' },
  { id: 'nateon', label: 'NateOn', color: '#00C73C',
    svg: '<path d="M20 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3l3 3v-3h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><text x="12" y="14" text-anchor="middle" fill="#fff" font-size="8" font-weight="bold">N</text>' },
  { id: 'wangwang', label: 'WangWang', color: '#FF6A00',
    svg: '<path d="M20 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3l3 3v-3h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><circle cx="8.5" cy="11" r="2" fill="#fff"/><circle cx="8.5" cy="11" r="1"/><circle cx="15.5" cy="11" r="2" fill="#fff"/><circle cx="15.5" cy="11" r="1"/>' },
  { id: 'vk', label: 'VK', color: '#0077FF',
    svg: '<path d="M21.5 7.1h-2.8c-.3 0-.4.2-.4.4 0 0 .1 1.8-1.5 3.9-.3.4-.5.2-.5-.1V7.5c0-.3-.2-.4-.5-.4h-2.5c-.2 0-.4.2-.2.4 1 1.3.1 5.5.1 5.5s-.1.4-.4.1c-.9-1-1.7-2.5-2.2-3.7-.1-.3-.3-.4-.6-.4H7.5c-.4 0-.5.2-.4.5.1.3 2.3 5.8 5 8.5 1.7 1.7 3.5 1.7 4.8 1.7h1c.3 0 .5-.2.5-.5v-1.5c0-.3.2-.6.4-.4.4.3 1.5 1.7 2.1 2.3.2.2.3.2.6.2h2.5c.5 0 .6-.3.3-.7a22 22 0 0 0-2.8-3.4c-.2-.3-.2-.4 0-.7 0 0 2.5-3.1 2.8-4.2.1-.5-.2-.8-.4-.3z"/>' },
];

class KWatchMessageCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("kwatch-message-card-editor");
  }

  static getStubConfig() {
    return {
      response_entity: "sensor.kwatch_last_response",
      battery_entity: "sensor.kwatch_battery",
      connection_entity: "binary_sensor.kwatch_connection",
    };
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!this._rendered) {
      this._render();
      this._rendered = true;
    }
    if (
      oldHass &&
      oldHass.states[this._config.response_entity] ===
        hass.states[this._config.response_entity] &&
      oldHass.states[this._config.battery_entity] ===
        hass.states[this._config.battery_entity] &&
      oldHass.states[this._config.connection_entity] ===
        hass.states[this._config.connection_entity]
    ) {
      return;
    }
    this._update();
  }

  setConfig(config) {
    if (!config.response_entity) {
      throw new Error("You must define a response_entity");
    }
    this._config = {
      title: config.title || "K-Watch Messenger",
      response_entity: config.response_entity,
      battery_entity: config.battery_entity,
      connection_entity: config.connection_entity,
      topic_prefix: config.topic_prefix || DEFAULT_TOPIC_PREFIX,
    };
    this._rendered = false;
  }

  getCardSize() {
    return 5;
  }

  _render() {
    if (!this._config) return;

    this.innerHTML = "";
    const card = document.createElement("ha-card");
    card.innerHTML = `
      <style>
        .kw-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 16px 0;
        }
        .kw-title {
          font-size: 1.1em;
          font-weight: 500;
        }
        .kw-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85em;
          color: var(--secondary-text-color);
        }
        .kw-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        .kw-dot.connected { background: #4caf50; }
        .kw-dot.disconnected { background: #f44336; }
        .kw-input-area {
          padding: 12px 16px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .kw-input-area input {
          flex: 1 1 60%;
          min-width: 0;
          padding: 8px 12px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          font-size: 0.95em;
          outline: none;
        }
        .kw-input-area input:focus {
          border-color: var(--primary-color);
        }
        .kw-send-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          cursor: pointer;
          font-size: 0.95em;
          font-weight: 500;
          white-space: nowrap;
        }
        .kw-send-btn:hover { opacity: 0.9; }
        .kw-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .kw-history {
          padding: 0 16px 16px;
          max-height: 300px;
          overflow-y: auto;
        }
        .kw-history-label {
          font-size: 0.8em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }
        .kw-msg {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 8px 0;
          border-bottom: 1px solid var(--divider-color, #e8e8e8);
        }
        .kw-msg:last-child { border-bottom: none; }
        .kw-msg-text {
          flex: 1;
          font-size: 0.9em;
          color: var(--primary-text-color);
        }
        .kw-msg-time {
          font-size: 0.75em;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }
        .kw-badge {
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.8em;
          font-weight: 500;
          white-space: nowrap;
          margin-left: 8px;
          flex-shrink: 0;
        }
        .kw-badge.ok { background: #e8f5e9; color: #2e7d32; }
        .kw-badge.no { background: #ffebee; color: #c62828; }
        .kw-badge.pending { background: #fff8e1; color: #f57f17; }
        .kw-badge.timeout { background: #f5f5f5; color: #757575; }
        .kw-empty {
          text-align: center;
          padding: 16px;
          color: var(--secondary-text-color);
          font-size: 0.9em;
        }
        .kw-history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .kw-clear-btn {
          background: none;
          border: none;
          color: var(--secondary-text-color);
          font-size: 0.8em;
          cursor: pointer;
          padding: 0;
        }
        .kw-clear-btn:hover { color: var(--primary-text-color); }
        .kw-action-btn {
          padding: 8px 12px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          cursor: pointer;
          font-size: 0.95em;
          white-space: nowrap;
        }
        .kw-action-btn:hover { opacity: 0.9; }
        .kw-action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .kw-app-selector {
          padding: 4px 16px 0;
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: thin;
        }
        .kw-app-selector::-webkit-scrollbar {
          height: 4px;
        }
        .kw-app-selector::-webkit-scrollbar-thumb {
          background: var(--divider-color, #ccc);
          border-radius: 2px;
        }
        .kw-app-btn {
          flex: 0 0 auto;
          width: 36px;
          height: 36px;
          padding: 0;
          border: 2px solid transparent;
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.15s, background 0.15s;
        }
        .kw-app-btn:hover {
          background: var(--secondary-background-color, #f5f5f5);
        }
        .kw-app-btn.selected {
          border-color: var(--primary-color);
          background: var(--primary-color);
        }
        .kw-app-btn.selected svg {
          fill: #fff;
          color: #fff;
        }
        .kw-app-btn svg {
          width: 20px;
          height: 20px;
          display: block;
        }
      </style>
      <div class="kw-header">
        <span class="kw-title">${this._escapeHtml(this._config.title)}</span>
        <div class="kw-status">
          <span class="kw-battery"></span>
          <span class="kw-dot disconnected"></span>
        </div>
      </div>
      <div class="kw-app-selector">
        ${NOTIFICATION_APPS.map(app => `
          <button class="kw-app-btn${app.id === 'sms' ? ' selected' : ''}" data-app="${app.id}" title="${app.label}">
            <svg viewBox="0 0 24 24" fill="${app.color}" color="${app.color}" xmlns="http://www.w3.org/2000/svg">${app.svg}</svg>
          </button>
        `).join('')}
      </div>
      <div class="kw-input-area">
        <input type="text" class="kw-message-input" placeholder="Type a message..." />
        <button class="kw-send-btn">Send</button>
        <button class="kw-action-btn" data-command="vibrate" title="Vibrate watch">Buzz</button>
        <button class="kw-action-btn" data-command="sync_weather" title="Sync weather to watch">Weather</button>
        <button class="kw-action-btn" data-command="sync_time" title="Sync time to watch">Time</button>
      </div>
      <div class="kw-history">
        <div class="kw-history-header">
          <div class="kw-history-label">Messages</div>
          <button class="kw-clear-btn">Clear</button>
        </div>
        <div class="kw-history-list"></div>
      </div>
    `;
    this.appendChild(card);

    this._selectedApp = 'sms';

    const input = this.querySelector(".kw-message-input");
    const btn = this.querySelector(".kw-send-btn");

    btn.addEventListener("click", () => this._sendMessage());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._sendMessage();
    });

    this.querySelectorAll(".kw-app-btn").forEach((el) => {
      el.addEventListener("click", () => {
        this.querySelector(".kw-app-btn.selected")?.classList.remove("selected");
        el.classList.add("selected");
        this._selectedApp = el.dataset.app;
      });
    });

    // Action buttons + clear: all publish to MQTT command topics
    this.querySelectorAll("[data-command]").forEach((el) => {
      el.addEventListener("click", () => this._publishCommand(el.dataset.command));
    });
    this.querySelector(".kw-clear-btn").addEventListener("click", () => {
      this._publishCommand("clear_history");
    });
  }

  _publishCommand(command, payload = "") {
    if (!this._hass) return;
    this._hass.callService("mqtt", "publish", {
      topic: `${this._config.topic_prefix}/${command}`,
      payload,
    });
  }

  _sendMessage() {
    const input = this.querySelector(".kw-message-input");
    const message = input.value.trim();
    if (!message) return;

    this._publishCommand("send_message", JSON.stringify({ title: DEFAULT_TITLE, message, app: this._selectedApp }));
    input.value = "";
  }

  _update() {
    if (!this._hass || !this._config) return;

    const responseState = this._hass.states[this._config.response_entity];
    const batteryState = this._config.battery_entity
      ? this._hass.states[this._config.battery_entity]
      : null;
    const connectionState = this._config.connection_entity
      ? this._hass.states[this._config.connection_entity]
      : null;

    const dot = this.querySelector(".kw-dot");
    if (dot && connectionState) {
      const connected = connectionState.state === "on";
      dot.className = `kw-dot ${connected ? "connected" : "disconnected"}`;
    }

    const batteryEl = this.querySelector(".kw-battery");
    if (batteryEl && batteryState && batteryState.state !== "unknown") {
      batteryEl.textContent = `${batteryState.state}%`;
    }

    const disconnected = !connectionState || connectionState.state !== "on";
    this.querySelectorAll(".kw-send-btn, .kw-action-btn").forEach((el) => {
      el.disabled = disconnected;
    });

    const historyList = this.querySelector(".kw-history-list");
    if (!historyList || !responseState) return;

    const history = responseState.attributes.message_history || [];

    if (history.length === 0) {
      historyList.innerHTML = '<div class="kw-empty">No messages yet</div>';
      return;
    }

    historyList.innerHTML = history
      .map((entry) => {
        const badge = this._badgeFor(entry.response);
        const time = entry.sent_at
          ? new Date(entry.sent_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        return `
          <div class="kw-msg">
            <div>
              <div class="kw-msg-text">${this._escapeHtml(entry.message || "")}</div>
              <div class="kw-msg-time">${this._escapeHtml(time)}</div>
            </div>
            ${badge}
          </div>
        `;
      })
      .join("");
  }

  _badgeFor(response) {
    if (!response) return '<span class="kw-badge pending">Pending</span>';
    if (response === RESPONSE_OK)
      return `<span class="kw-badge ok">${this._escapeHtml(RESPONSE_OK)}</span>`;
    if (response === RESPONSE_NO)
      return `<span class="kw-badge no">${this._escapeHtml(RESPONSE_NO)}</span>`;
    if (response === RESPONSE_TIMEOUT)
      return `<span class="kw-badge timeout">${this._escapeHtml(RESPONSE_TIMEOUT)}</span>`;
    return `<span class="kw-badge timeout">${this._escapeHtml(response)}</span>`;
  }

  _escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

customElements.define("kwatch-message-card", KWatchMessageCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "kwatch-message-card",
  name: "K-Watch Messenger",
  description: "Send messages to K-Watch and view responses",
});
