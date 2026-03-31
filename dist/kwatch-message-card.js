/**
 * K-Watch Messenger - Custom Lovelace Card (MQTT version)
 *
 * Send messages to a K-WATCH via MQTT and view responses.
 */

const RESPONSE_OK = "OK - got it";
const RESPONSE_NO = "No";
const RESPONSE_TIMEOUT = "No response";
const DEFAULT_TITLE = "HA";
const MQTT_COMMAND_TOPIC = "kwatch/command/send_message";

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
      command_topic: config.command_topic || MQTT_COMMAND_TOPIC,
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
        }
        .kw-input-area input {
          flex: 1;
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
      </style>
      <div class="kw-header">
        <span class="kw-title">${this._escapeHtml(this._config.title)}</span>
        <div class="kw-status">
          <span class="kw-battery"></span>
          <span class="kw-dot disconnected"></span>
        </div>
      </div>
      <div class="kw-input-area">
        <input type="text" class="kw-message-input" placeholder="Type a message..." />
        <button class="kw-send-btn">Send</button>
      </div>
      <div class="kw-history">
        <div class="kw-history-label">Messages</div>
        <div class="kw-history-list"></div>
      </div>
    `;
    this.appendChild(card);

    const input = this.querySelector(".kw-message-input");
    const btn = this.querySelector(".kw-send-btn");

    btn.addEventListener("click", () => this._sendMessage());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._sendMessage();
    });
  }

  _sendMessage() {
    const input = this.querySelector(".kw-message-input");
    const message = input.value.trim();
    if (!message || !this._hass) return;

    this._hass.callService("mqtt", "publish", {
      topic: this._config.command_topic,
      payload: JSON.stringify({ title: DEFAULT_TITLE, message }),
    });
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

    const btn = this.querySelector(".kw-send-btn");
    if (btn && connectionState) {
      btn.disabled = connectionState.state !== "on";
    }

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
