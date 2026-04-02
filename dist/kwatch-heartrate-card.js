/**
 * K-Watch Heart Rate Card - Custom Lovelace Card
 *
 * Displays real-time heart rate from a K-WATCH via MQTT sensor.
 */

const DEFAULT_TOPIC_PREFIX = "kwatch/command";
const STALE_MINUTES = 10;

class KWatchHeartRateCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("kwatch-heartrate-card-editor");
  }

  static getStubConfig() {
    return {
      heart_rate_entity: "sensor.kwatch_heart_rate",
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
      oldHass.states[this._config.heart_rate_entity] ===
        hass.states[this._config.heart_rate_entity] &&
      oldHass.states[this._config.connection_entity] ===
        hass.states[this._config.connection_entity]
    ) {
      return;
    }
    this._update();
  }

  setConfig(config) {
    if (!config.heart_rate_entity) {
      throw new Error("You must define a heart_rate_entity");
    }
    this._config = {
      title: config.title || "Heart Rate",
      heart_rate_entity: config.heart_rate_entity,
      connection_entity: config.connection_entity,
      topic_prefix: config.topic_prefix || DEFAULT_TOPIC_PREFIX,
    };
    this._rendered = false;
    this._measuring = false;
  }

  getCardSize() {
    return 3;
  }

  _render() {
    if (!this._config) return;

    this.innerHTML = "";
    const card = document.createElement("ha-card");
    card.innerHTML = `
      <style>
        .khr-container {
          padding: 20px;
          text-align: center;
        }
        .khr-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .khr-title {
          font-size: 1.1em;
          font-weight: 500;
        }
        .khr-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85em;
          color: var(--secondary-text-color);
        }
        .khr-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        .khr-dot.connected { background: #4caf50; }
        .khr-dot.disconnected { background: #f44336; }
        .khr-reading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 16px 0;
        }
        .khr-icon {
          font-size: 2.5em;
          color: #e53935;
          line-height: 1;
        }
        .khr-icon.pulse {
          animation: khr-pulse 1s ease-in-out infinite;
        }
        @keyframes khr-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        .khr-bpm {
          font-size: 3em;
          font-weight: 700;
          color: var(--primary-text-color);
          line-height: 1;
        }
        .khr-unit {
          font-size: 0.35em;
          font-weight: 400;
          color: var(--secondary-text-color);
          display: block;
        }
        .khr-bpm.stale {
          color: var(--secondary-text-color);
        }
        .khr-timestamp {
          font-size: 0.8em;
          color: var(--secondary-text-color);
          margin-bottom: 12px;
        }
        .khr-no-data {
          font-size: 1.1em;
          color: var(--secondary-text-color);
          margin: 24px 0;
        }
        .khr-measure-btn {
          padding: 8px 20px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          cursor: pointer;
          font-size: 0.9em;
        }
        .khr-measure-btn:hover { opacity: 0.9; }
        .khr-measure-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .khr-measure-btn.active {
          background: #e53935;
          color: #fff;
          border-color: #e53935;
        }
      </style>
      <div class="khr-container">
        <div class="khr-header">
          <span class="khr-title">${this._escapeHtml(this._config.title)}</span>
          <div class="khr-status">
            <span class="khr-dot disconnected"></span>
          </div>
        </div>
        <div class="khr-body">
          <div class="khr-no-data">No heart rate data</div>
        </div>
        <button class="khr-measure-btn" disabled>Measure</button>
      </div>
    `;
    this.appendChild(card);

    this.querySelector(".khr-measure-btn").addEventListener("click", () => {
      this._toggleMeasure();
    });
  }

  _toggleMeasure() {
    if (!this._hass) return;
    this._measuring = !this._measuring;
    const command = this._measuring ? "measure_heart_rate" : "stop_heart_rate";
    this._hass.callService("mqtt", "publish", {
      topic: `${this._config.topic_prefix}/${command}`,
      payload: "",
    });
    this._updateMeasureButton();
  }

  _updateMeasureButton() {
    const btn = this.querySelector(".khr-measure-btn");
    if (!btn) return;
    btn.textContent = this._measuring ? "Stop" : "Measure";
    btn.classList.toggle("active", this._measuring);
  }

  _update() {
    if (!this._hass || !this._config) return;

    const hrState = this._hass.states[this._config.heart_rate_entity];
    const connectionState = this._config.connection_entity
      ? this._hass.states[this._config.connection_entity]
      : null;

    // Connection dot
    const dot = this.querySelector(".khr-dot");
    if (dot && connectionState) {
      const connected = connectionState.state === "on";
      dot.className = `khr-dot ${connected ? "connected" : "disconnected"}`;
    }

    // Measure button
    const disconnected = !connectionState || connectionState.state !== "on";
    const btn = this.querySelector(".khr-measure-btn");
    if (btn) btn.disabled = disconnected;
    if (disconnected) this._measuring = false;
    this._updateMeasureButton();

    // Heart rate display
    const body = this.querySelector(".khr-body");
    if (!body) return;

    const bpm = hrState ? parseInt(hrState.state, 10) : NaN;
    const timestamp = hrState?.attributes?.timestamp;

    if (isNaN(bpm) || bpm <= 0) {
      body.innerHTML = '<div class="khr-no-data">No heart rate data</div>';
      return;
    }

    const stale = this._isStale(timestamp);
    const timeStr = timestamp
      ? this._formatTime(timestamp)
      : "";

    body.innerHTML = `
      <div class="khr-reading">
        <span class="khr-icon ${stale ? "" : "pulse"}">&#x2764;&#xFE0F;</span>
        <span class="khr-bpm ${stale ? "stale" : ""}">
          ${bpm}
          <span class="khr-unit">BPM</span>
        </span>
      </div>
      ${timeStr ? `<div class="khr-timestamp">${this._escapeHtml(timeStr)}</div>` : ""}
    `;
  }

  _isStale(timestamp) {
    if (!timestamp) return true;
    const age = Date.now() - new Date(timestamp).getTime();
    return age > STALE_MINUTES * 60 * 1000;
  }

  _formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;

    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;

    return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  _escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

customElements.define("kwatch-heartrate-card", KWatchHeartRateCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "kwatch-heartrate-card",
  name: "K-Watch Heart Rate",
  description: "Display heart rate from K-Watch",
});
