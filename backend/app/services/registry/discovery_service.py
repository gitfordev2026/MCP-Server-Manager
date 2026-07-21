from dataclasses import dataclass, field
from typing import Any

@dataclass
class DiscoveredToolParameters:
    name: str
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)
    method: str | None = None
    path: str | None = None

@dataclass
class DiscoveredServerSnapshot:
    """Provisional snapshot representing an external MCP server or OpenAPI raw API."""
    name: str
    source_type: str  # "mcp" | "openapi"
    url: str
    tools: list[DiscoveredToolParameters]
    error: str | None = None
    is_alive: bool = True
