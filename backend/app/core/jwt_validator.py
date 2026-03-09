"""JWT token validation using PyJWT + JWKS (RS256).

Fetches signing keys from the Keycloak JWKS endpoint (with built-in caching)
and validates access tokens for signature, expiry, issuer, and optionally audience.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import jwt
from jwt import PyJWKClient

from app.core.auth import (
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_ISSUER,
    KEYCLOAK_JWKS_URL,
    KEYCLOAK_VERIFY_AUD,
)


class TokenValidationError(Exception):
    """Raised when a JWT token cannot be validated."""


@dataclass(frozen=True)
class TokenClaims:
    username: str
    email: str
    roles: list[str] = field(default_factory=list)
    subject: str = ""


# Module-level JWKS client — reused across requests.
# PyJWKClient has built-in key caching (lifespan defaults to 300 s).
_jwks_client: PyJWKClient | None = None


def _get_jwks_client(jwks_url: str | None = None) -> PyJWKClient:
    global _jwks_client
    url = jwks_url or KEYCLOAK_JWKS_URL
    if not url:
        raise TokenValidationError("JWKS URL is not configured")
    if _jwks_client is None or jwks_url is not None:
        _jwks_client = PyJWKClient(url, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


def validate_token(
    token: str,
    *,
    jwks_url: str | None = None,
    issuer: str | None = None,
    client_id: str | None = None,
    verify_aud: bool | None = None,
) -> TokenClaims:
    """Validate a Keycloak JWT and return extracted claims.

    Parameters
    ----------
    token : str
        Raw JWT string (without the "Bearer " prefix).
    jwks_url, issuer, client_id, verify_aud : optional overrides
        Allow callers to override the module-level Keycloak config
        (useful for multi-domain setups or testing).

    Returns
    -------
    TokenClaims

    Raises
    ------
    TokenValidationError
        When the token is invalid, expired, or has a bad signature.
    """
    _issuer = issuer or KEYCLOAK_ISSUER
    _client_id = client_id or KEYCLOAK_CLIENT_ID
    _verify_aud = verify_aud if verify_aud is not None else KEYCLOAK_VERIFY_AUD

    try:
        client = _get_jwks_client(jwks_url)
        signing_key = client.get_signing_key_from_jwt(token)

        decode_options: dict[str, Any] = {
            "algorithms": ["RS256"],
            "issuer": _issuer,
        }
        if _verify_aud and _client_id:
            decode_options["audience"] = _client_id
        else:
            decode_options["options"] = {"verify_aud": False}

        payload: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            **decode_options,
        )
    except jwt.ExpiredSignatureError:
        raise TokenValidationError("Token has expired")
    except jwt.InvalidIssuerError:
        raise TokenValidationError("Invalid token issuer")
    except jwt.InvalidAudienceError:
        raise TokenValidationError("Invalid token audience")
    except jwt.PyJWTError as exc:
        raise TokenValidationError(f"Token validation failed: {exc}")
    except Exception as exc:
        raise TokenValidationError(f"Unexpected error during token validation: {exc}")

    # Extract roles from both realm_access and resource_access.
    roles: list[str] = []
    realm_roles = payload.get("realm_access", {}).get("roles", [])
    roles.extend(r.lower() for r in realm_roles if isinstance(r, str))

    if _client_id:
        client_roles = (
            payload.get("resource_access", {})
            .get(_client_id, {})
            .get("roles", [])
        )
        roles.extend(r.lower() for r in client_roles if isinstance(r, str))

    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique_roles: list[str] = []
    for r in roles:
        if r not in seen:
            seen.add(r)
            unique_roles.append(r)

    return TokenClaims(
        username=payload.get("preferred_username", "unknown"),
        email=payload.get("email", ""),
        roles=unique_roles,
        subject=payload.get("sub", ""),
    )
