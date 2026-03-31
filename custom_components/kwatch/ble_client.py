"""Persistent BLE connection manager for the K-WATCH."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from bleak import BleakClient
from bleak.exc import BleakError
from bleak_retry_connector import establish_connection
from homeassistant.components.bluetooth import async_ble_device_from_address
from homeassistant.core import HomeAssistant

from .const import (
    INTER_PACKET_DELAY,
    RECONNECT_BASE_DELAY,
    RECONNECT_MAX_DELAY,
    RX_CHAR_UUID,
    SERVICE_UUID,
    TX_CHAR_UUID,
)
from .protocol import (
    encode_battery_request,
    encode_keepalive_response,
    encode_notification,
    encode_time_sync,
    parse_response,
)

_LOGGER = logging.getLogger(__name__)


class KWatchBleClient:
    """Manages the persistent BLE connection to a K-WATCH device."""

    def __init__(
        self,
        hass: HomeAssistant,
        address: str,
        on_data: Callable[[dict], None],
        on_connection_change: Callable[[bool], None],
    ) -> None:
        self._hass = hass
        self._address = address
        self._on_data = on_data
        self._on_connection_change = on_connection_change

        self._client: BleakClient | None = None
        self._reconnect_task: asyncio.Task | None = None
        self._reconnect_delay = RECONNECT_BASE_DELAY
        self._shutting_down = False

    @property
    def connected(self) -> bool:
        return self._client is not None and self._client.is_connected

    async def connect(self) -> None:
        """Establish BLE connection and subscribe to notifications."""
        try:
            ble_device = async_ble_device_from_address(
                self._hass, self._address, connectable=True
            )
            if not ble_device:
                _LOGGER.warning("K-WATCH %s not found, will retry", self._address)
                self._schedule_reconnect()
                return

            self._client = await establish_connection(
                BleakClient,
                ble_device,
                self._address,
                disconnected_callback=self._on_disconnect,
                services=[SERVICE_UUID],
            )

            await self._client.start_notify(RX_CHAR_UUID, self._on_notification)

            self._reconnect_delay = RECONNECT_BASE_DELAY
            self._on_connection_change(True)
            _LOGGER.info("Connected to K-WATCH %s", self._address)

            await self._write(encode_time_sync())
            await asyncio.sleep(INTER_PACKET_DELAY)
            await self._write(encode_battery_request())

        except (BleakError, TimeoutError, OSError) as err:
            _LOGGER.warning("Failed to connect to K-WATCH %s: %s", self._address, err)
            self._schedule_reconnect()

    async def disconnect(self) -> None:
        """Disconnect and stop reconnection attempts."""
        self._shutting_down = True
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            self._reconnect_task = None
        if self._client and self._client.is_connected:
            try:
                await self._client.stop_notify(RX_CHAR_UUID)
            except BleakError:
                pass
            try:
                await self._client.disconnect()
            except BleakError:
                pass
        self._client = None

    async def send_message(self, title: str, body: str, type_id: int = 1) -> None:
        """Send a notification message to the watch as a multi-packet sequence."""
        if not self.connected:
            raise ConnectionError("Not connected to K-WATCH")

        packets = encode_notification(title, body, type_id)
        for packet in packets:
            await self._write(packet)
            await asyncio.sleep(INTER_PACKET_DELAY)

    async def _write(self, data: bytes) -> None:
        """Write a packet to the TX characteristic."""
        if not self.connected:
            raise ConnectionError("Not connected to K-WATCH")
        await self._client.write_gatt_char(TX_CHAR_UUID, data, response=True)

    def _on_notification(self, _sender: Any, data: bytearray) -> None:
        """Handle incoming BLE notification from the watch."""
        parsed = parse_response(data)

        if parsed["type"] == "keepalive":
            self._hass.async_create_task(self._respond_keepalive())
            return

        self._on_data(parsed)

    async def _respond_keepalive(self) -> None:
        """Send keepalive response back to the watch."""
        try:
            await self._write(encode_keepalive_response())
        except (BleakError, ConnectionError) as err:
            _LOGGER.debug("Failed to send keepalive response: %s", err)

    def _on_disconnect(self, _client: BleakClient) -> None:
        """Handle unexpected disconnection."""
        _LOGGER.info("K-WATCH %s disconnected", self._address)
        self._client = None
        self._on_connection_change(False)
        if not self._shutting_down:
            self._schedule_reconnect()

    def _schedule_reconnect(self) -> None:
        """Schedule a reconnection attempt with exponential backoff."""
        if self._shutting_down:
            return
        if self._reconnect_task and not self._reconnect_task.done():
            return

        delay = self._reconnect_delay
        self._reconnect_delay = min(
            self._reconnect_delay * 2, RECONNECT_MAX_DELAY
        )
        _LOGGER.debug("Scheduling reconnect in %ds", delay)
        self._reconnect_task = self._hass.async_create_task(self._reconnect(delay))

    async def _reconnect(self, delay: float) -> None:
        """Wait and then attempt to reconnect."""
        try:
            await asyncio.sleep(delay)
            if not self._shutting_down:
                await self.connect()
        finally:
            self._reconnect_task = None
