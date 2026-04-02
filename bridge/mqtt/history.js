/**
 * Message history manager with timeout handling.
 */

const fs = require('fs');

const RESPONSE_TIMEOUT = 'No response';

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
    this._expirePending();

    this._history.unshift({
      title,
      message,
      sent_at: new Date().toISOString(),
      response: null,
      responded_at: null,
    });
    this._history = this._history.slice(0, this._config.maxHistoryEntries);

    this._clearTimeout();
    this._timeoutTimer = setTimeout(() => this._onTimeout(), this._config.messageTimeout * 1000);

    this._save();
    this._publishHistory();
    this._publishLast();
  }

  clear() {
    this._clearTimeout();
    this._history = [];
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
    }

    // Always publish the latest response state, even if unsolicited
    this._publishLast(response);
  }

  /** Returns true if the most recent message is still awaiting a response. */
  hasPendingMessage() {
    return this._history.length > 0 && this._history[0].response === null;
  }

  /** Update the message timeout (in seconds) and restart any active timer. */
  setMessageTimeout(seconds) {
    this._config.messageTimeout = seconds;
    if (this._timeoutTimer && this.hasPendingMessage()) {
      this._clearTimeout();
      const elapsed = Date.now() - new Date(this._history[0].sent_at).getTime();
      const remaining = (seconds * 1000) - elapsed;
      if (remaining <= 0) {
        this._onTimeout();
      } else {
        this._timeoutTimer = setTimeout(() => this._onTimeout(), remaining);
      }
    }
  }

  _expirePending() {
    if (this._history.length > 0 && this._history[0].response === null) {
      this._history[0].response = RESPONSE_TIMEOUT;
      this._history[0].responded_at = new Date().toISOString();
    }
  }

  _onTimeout() {
    this._timeoutTimer = null;
    if (this._history.length > 0 && this._history[0].response === null) {
      console.log('[HISTORY] Message timed out');
      this._expirePending();
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

  /**
   * Publish the last message state. If responseOverride is given (for unsolicited
   * responses), use it; otherwise use the most recent history entry.
   */
  _publishLast(responseOverride) {
    const last = this._history[0];
    const payload = last
      ? {
          message: last.message,
          response: responseOverride || last.response,
          sent_at: last.sent_at,
          responded_at: last.responded_at,
        }
      : { message: '', response: 'Idle', sent_at: null, responded_at: null };
    this._mqtt.publishRetained('message/last', JSON.stringify(payload));
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
