"""Data coordinator for the K-Watch Messenger integration."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util.dt import utcnow

from .ble_client import KWatchBleClient
from .const import (
    CONF_DEVICE_ADDRESS,
    DEFAULT_MESSAGE_TIMEOUT,
    DOMAIN,
    MAX_HISTORY_ENTRIES,
    RESPONSE_NO,
    RESPONSE_OK,
    RESPONSE_PENDING,
    RESPONSE_TIMEOUT,
)

_LOGGER = logging.getLogger(__name__)

_INITIAL_DATA: dict[str, Any] = {
    "battery_level": None,
    "battery_charging": None,
    "connected": False,
    "last_message": None,
    "last_message_time": None,
    "last_response": None,
    "last_response_time": None,
    "message_history": [],
}


class KWatchCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinate K-WATCH BLE data and messaging state."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=entry.title,
            update_interval=None,
        )
        self.entry = entry
        self._address = entry.data[CONF_DEVICE_ADDRESS]
        self._cancel_timeout: CALLBACK_TYPE | None = None

        self.data: dict[str, Any] = {**_INITIAL_DATA, "message_history": []}

        self.ble_client = KWatchBleClient(
            hass,
            self._address,
            on_data=self._handle_data,
            on_connection_change=self._handle_connection_change,
        )

    async def async_setup(self) -> None:
        """Start watching for advertisements and connect in background."""
        self.ble_client.start_watching()
        self.hass.async_create_task(self.ble_client.connect())

    async def async_shutdown(self) -> None:
        """Clean up timeout and BLE connection."""
        if self._cancel_timeout:
            self._cancel_timeout()
            self._cancel_timeout = None
        await self.ble_client.disconnect()

    @callback
    def _handle_data(self, parsed: dict) -> None:
        """Handle parsed BLE data from the watch."""
        if parsed["type"] == "battery":
            if (
                self.data["battery_level"] == parsed["level"]
                and self.data["battery_charging"] == parsed["charging"]
            ):
                return
            data = {**self.data}
            data["battery_level"] = parsed["level"]
            data["battery_charging"] = parsed["charging"]
            self.async_set_updated_data(data)

        elif parsed["type"] == "event":
            action = parsed.get("action")
            if action in ("ok", "no"):
                data = {**self.data, "message_history": list(self.data["message_history"])}
                self._resolve_pending_message(
                    data, RESPONSE_OK if action == "ok" else RESPONSE_NO
                )
                self.async_set_updated_data(data)

    @callback
    def _handle_connection_change(self, connected: bool) -> None:
        """Handle BLE connection state changes."""
        if self.data.get("connected") == connected:
            return
        data = {**self.data}
        data["connected"] = connected
        self.async_set_updated_data(data)

    async def send_message(self, title: str, body: str) -> None:
        """Send a message to the watch and track it."""
        await self.ble_client.send_message(title, body)

        now = utcnow()
        data = {**self.data, "message_history": list(self.data["message_history"])}

        if data["last_response"] == RESPONSE_PENDING:
            self._resolve_pending_message(data, RESPONSE_TIMEOUT)

        data["last_message"] = body
        data["last_message_time"] = now.isoformat()
        data["last_response"] = RESPONSE_PENDING
        data["last_response_time"] = None

        data["message_history"].insert(0, {
            "message": body,
            "title": title,
            "sent_at": now.isoformat(),
            "response": None,
            "responded_at": None,
        })
        data["message_history"] = data["message_history"][:MAX_HISTORY_ENTRIES]

        self.async_set_updated_data(data)

        if self._cancel_timeout:
            self._cancel_timeout()
        self._cancel_timeout = async_call_later(
            self.hass, DEFAULT_MESSAGE_TIMEOUT, self._on_message_timeout
        )

    def _resolve_pending_message(self, data: dict, response: str) -> None:
        """Resolve the current pending message with a response."""
        if self._cancel_timeout:
            self._cancel_timeout()
            self._cancel_timeout = None

        now = utcnow()
        data["last_response"] = response
        data["last_response_time"] = now.isoformat()

        history = data["message_history"]
        if history and history[0]["response"] is None:
            history[0] = {**history[0], "response": response, "responded_at": now.isoformat()}

        self.hass.bus.async_fire(
            f"{DOMAIN}_response",
            {
                "device_name": self.entry.title,
                "message": data.get("last_message", ""),
                "response": response,
                "timestamp": now.isoformat(),
            },
        )

    @callback
    def _on_message_timeout(self, _now: Any) -> None:
        """Handle message response timeout."""
        self._cancel_timeout = None
        if self.data.get("last_response") != RESPONSE_PENDING:
            return
        data = {**self.data, "message_history": list(self.data["message_history"])}
        self._resolve_pending_message(data, RESPONSE_TIMEOUT)
        self.async_set_updated_data(data)
