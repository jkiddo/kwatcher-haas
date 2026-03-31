"""Config flow for K-Watch Messenger integration."""

from __future__ import annotations

import logging

import voluptuous as vol
from homeassistant.components.bluetooth import (
    BluetoothServiceInfoBleak,
    async_discovered_service_info,
)
from homeassistant.config_entries import ConfigFlow
from homeassistant.data_entry_flow import FlowResult

from .const import CONF_DEVICE_ADDRESS, CONF_DEVICE_NAME, DOMAIN, SERVICE_UUID

_LOGGER = logging.getLogger(__name__)


class KWatchConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for K-Watch Messenger."""

    VERSION = 1

    def __init__(self) -> None:
        self._discovery_info: BluetoothServiceInfoBleak | None = None
        self._discovered_devices: dict[str, str] = {}

    def _create_entry(self, name: str, address: str) -> FlowResult:
        """Create a config entry for a K-Watch device."""
        return self.async_create_entry(
            title=name,
            data={
                CONF_DEVICE_ADDRESS: address,
                CONF_DEVICE_NAME: name,
            },
        )

    async def async_step_bluetooth(
        self, discovery_info: BluetoothServiceInfoBleak
    ) -> FlowResult:
        """Handle Bluetooth discovery."""
        await self.async_set_unique_id(discovery_info.address.lower())
        self._abort_if_unique_id_configured()

        self._discovery_info = discovery_info
        name = discovery_info.name or "K-WATCH"
        self.context["title_placeholders"] = {"name": name}
        return await self.async_step_bluetooth_confirm()

    async def async_step_bluetooth_confirm(
        self, user_input: dict | None = None
    ) -> FlowResult:
        """Confirm Bluetooth discovery."""
        assert self._discovery_info is not None
        name = self._discovery_info.name or "K-WATCH"

        if user_input is not None:
            return self._create_entry(name, self._discovery_info.address)

        return self.async_show_form(
            step_id="bluetooth_confirm",
            description_placeholders={"name": name},
        )

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> FlowResult:
        """Handle manual setup by user."""
        if user_input is not None:
            address = user_input[CONF_DEVICE_ADDRESS]
            await self.async_set_unique_id(address.lower())
            self._abort_if_unique_id_configured()

            name = self._discovered_devices.get(address, "K-WATCH")
            return self._create_entry(name, address)

        self._discovered_devices = {}
        for info in async_discovered_service_info(self.hass):
            if SERVICE_UUID in info.service_uuids:
                self._discovered_devices[info.address] = info.name or "K-WATCH"

        if self._discovered_devices:
            return self.async_show_form(
                step_id="user",
                data_schema=vol.Schema(
                    {
                        vol.Required(CONF_DEVICE_ADDRESS): vol.In(
                            {
                                addr: f"{name} ({addr})"
                                for addr, name in self._discovered_devices.items()
                            }
                        ),
                    }
                ),
            )

        return await self.async_step_manual()

    async def async_step_manual(
        self, user_input: dict | None = None
    ) -> FlowResult:
        """Handle manual address entry when no devices are discovered."""
        if user_input is not None:
            address = user_input[CONF_DEVICE_ADDRESS]
            name = user_input.get(CONF_DEVICE_NAME, "K-WATCH")
            await self.async_set_unique_id(address.lower())
            self._abort_if_unique_id_configured()

            return self._create_entry(name, address)

        return self.async_show_form(
            step_id="manual",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_DEVICE_ADDRESS): str,
                    vol.Optional(CONF_DEVICE_NAME, default="K-WATCH"): str,
                }
            ),
        )
