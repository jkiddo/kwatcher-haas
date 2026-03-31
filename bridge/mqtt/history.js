/**
 * Message history manager with timeout handling.
 */

const fs = require('fs');

class HistoryManager {
  constructor(config, mqtt) {
    this._config = config;
    this._mqtt = mqtt;
    this._history = [];
    this._timeoutTimer = null;
  }

  load() {
    try {
      this._history = JSON.parse(fs.readFileSync(this._config.historyFile, 'utf8'));
      console.log(`[HISTORY] Loaded ${this._history.length} entries`);
    } catch (_) {
      this._history = [];
    }
    this._publishHistory();
    this._publishLast();
  }

  addMessage(title, message) {
    const entry = {
      title,
      message,
      sent_at: new Date().toISOString(),
      response: null,
      responded_at: null,
    };

    // If there's a pending message, time it out
    if (this._history.length > 0 && this._history[0].response === null) {
      this._history[0].response = 'No response';
      this._history[0].responded_at = new Date().toISOString();
    }

    this._history.unshift(entry);
    this._history = this._history.slice(0, this._config.maxHistoryEntries);

    this._clearTimeout();
    this._timeoutTimer = setTimeout(() => {
      this._onTimeout();
    }, this._config.messageTimeout * 1000);

    this._save();
    this._publishHistory();
    this._publishLast();
  }

  resolveMessage(response) {
    this._clearTimeout();

    if (this._history.length > 0 && this._history[0].response === null) {
      this._history[0].response = response;
      this._history[0].responded_at = new Date().toISOString();
      this._save();
      this._publishHistory();
      this._publishLast();
    }
  }

  _onTimeout() {
    this._timeoutTimer = null;
    if (this._history.length > 0 && this._history[0].response === null) {
      console.log('[HISTORY] Message timed out');
      this._history[0].response = 'No response';
      this._history[0].responded_at = new Date().toISOString();
      this._save();
      this._publishHistory();
      this._publishLast();
    }
  }

  _clearTimeout() {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
  }

  _publishHistory() {
    this._mqtt.publishRetained('message/history', JSON.stringify(this._history));
  }

  _publishLast() {
    const last = this._history[0];
    if (last) {
      this._mqtt.publishRetained('message/last', JSON.stringify(last));
    } else {
      this._mqtt.publishRetained('message/last', JSON.stringify({
        message: '',
        response: 'Idle',
        sent_at: null,
        responded_at: null,
      }));
    }
  }

  _save() {
    try {
      fs.writeFileSync(this._config.historyFile, JSON.stringify(this._history, null, 2));
    } catch (err) {
      console.error(`[HISTORY] Failed to save: ${err.message}`);
    }
  }
}

module.exports = HistoryManager;
