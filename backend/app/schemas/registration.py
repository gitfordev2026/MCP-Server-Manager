import ipaddress
from enum import Enum
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, field_validator


class DomainType(str, Enum):
    ADM = "ADM"
    OPS = "OPS"


class ServerRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    url: str
    description: str | None = ""
    domain_type: DomainType = DomainType.ADM
    selected_tools: list[str] = []

    @field_validator("url")
    @classmethod
    def validate_server_url(cls, value: str) -> str:
        url = value.strip()
        parsed = urlparse(url)

        if parsed.scheme not in {"http", "https"}:
            raise ValueError("URL must start with http:// or https://")
        if not parsed.hostname:
            raise ValueError("URL must include a valid hostname or IP address")

        hostname = parsed.hostname
        try:
            ipaddress.ip_address(hostname)
        except ValueError:
            if hostname != "localhost" and "." not in hostname:
                raise ValueError(
                    "URL host must be a valid IP, localhost, or a fully qualified domain (e.g. api.example.com)"
                )

        try:
            port = parsed.port
        except ValueError as exc:
            raise ValueError("URL must include a valid numeric port") from exc

        if port is None:
            raise ValueError("URL must include an explicit port, e.g. :8005")

        return url

    @field_validator("description")
    @classmethod
    def validate_server_description(cls, value: str | None) -> str:
        if value is None:
            return ""
        return value.strip()


class BaseURLRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    url: str
    description: str | None = ""
    openapi_path: str | None = ""
    include_unreachable_tools: bool = False
    domain_type: DomainType = DomainType.ADM
    selected_endpoints: list[str] = []

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("description is required")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("description is required")
        return trimmed
