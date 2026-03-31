"""K-Watch Messenger integration for Home Assistant."""

from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]

SEND_MESSAGE_SCHEMA = vol.Schema(
    {
        vol.Required("message"): str,
        vol.Optional("title", default="HA"): str,
    }
)

FRONTEND_PATH = str(Path(__file__).parent / "frontend" / "kwatch-message-card.js")
FRONTEND_URL = "/kwatch/kwatch-message-card.js"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the K-Watch Messenger integration (platform-level)."""
    # Register the static path for the Lovelace card early so it's
    # available even before a config entry is fully loaded.
    hass.http.register_static_path(FRONTEND_URL, FRONTEND_PATH, cache_headers=False)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up K-Watch Messenger from a config entry."""
    from .coordinator import KWatchCoordinator  # noqa: E402

    coordinator = KWatchCoordinator(hass, entry)
    await coordinator.async_setup()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    # Register the send_message service (once, shared across all entries)
    if not hass.services.has_service(DOMAIN, "send_message"):

        async def handle_send_message(call: ServiceCall) -> None:
            """Handle the kwatch.send_message service call."""
            message = call.data["message"]
            title = call.data.get("title", "HA")

            # Use the first (or only) configured device
            coordinators = hass.data[DOMAIN]
            if not coordinators:
                _LOGGER.error("No K-Watch devices configured")
                return

            coord = next(iter(coordinators.values()))
            await coord.send_message(title, message)

        hass.services.async_register(
            DOMAIN, "send_message", handle_send_message, schema=SEND_MESSAGE_SCHEMA
        )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a K-Watch Messenger config entry."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    coordinator._cancel_timeout()
    await coordinator.ble_client.disconnect()

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

    # Remove service if no more devices
    if not hass.data.get(DOMAIN):
        hass.services.async_remove(DOMAIN, "send_message")

    return unload_ok
