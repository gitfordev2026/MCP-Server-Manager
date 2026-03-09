from __future__ import annotations

import logging

from colorlog import ColoredFormatter

from backend.env import ENV


_HANDLER_MARKER = "_mcp_use_colored_handler"


def _resolve_log_level(level_name: str) -> int:
    value = (level_name or "INFO").strip().upper()
    return getattr(logging, value, logging.INFO)


def configure_logging(level_name: str | None = None) -> None:
    """Configure root logging once with env-driven log level."""
    root_logger = logging.getLogger()
    root_logger.setLevel(_resolve_log_level(level_name or ENV.log_level))

    has_custom_handler = any(getattr(handler, _HANDLER_MARKER, False) for handler in root_logger.handlers)
    if has_custom_handler:
        return

    # Only attach our colored handler when no handlers exist.
    # This avoids duplicate logs when another runtime already configured logging.
    if root_logger.handlers:
        return

    handler = logging.StreamHandler()
    handler.setFormatter(
        ColoredFormatter(
            "%(log_color)s%(levelname)s:%(name)s:%(message)s",
            log_colors={
                "DEBUG": "cyan",
                "INFO": "green",
                "WARNING": "yellow",
                "ERROR": "red,bg_white",
                "CRITICAL": "red,bg_white",
            },
        )
    )
    setattr(handler, _HANDLER_MARKER, True)
    root_logger.addHandler(handler)


def get_logger(name: str | None = None) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)

