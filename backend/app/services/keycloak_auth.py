import time
from typing import Any
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.env import ENV
from app.models.db_models import DomainAuthProfileModel
from app.core.logger import get_logger

logger = get_logger(__name__)

# Basic in-memory cache: domain_type -> {"token": str, "expires_at": float}
_TOKEN_CACHE: dict[str, dict[str, Any]] = {}

# Buffer time to refresh the token before it actually expires
_EXPIRY_BUFFER_SEC = 30


async def get_keycloak_token(domain_type: str, db: Session) -> str | None:
    """
    Fetches a Keycloak M2M access token (Client Credentials Grant) for the given domain.
    Resolution order:
      1. ENV.adm_keycloak_* / ENV.ops_keycloak_* (ADM_KEYCLOAK_* / OPS_KEYCLOAK_* env vars)
      2. Main KEYCLOAK_* env vars (single-realm fallback — KEYCLOAK_SERVER_URL, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET)
      3. DB domain_auth_profiles table
    Uses in-memory caching to reuse valid tokens.
    """
    domain = domain_type.strip().upper()

    # Single Keycloak mode vs Multi Keycloak mode flag check
    if not ENV.enable_multi_keycloak and domain != "ADM":
        logger.debug(f"Single Keycloak mode enabled: routing domain '{domain}' request to ADM Keycloak")
        domain = "ADM"

    # 1. Check Cache
    cached = _TOKEN_CACHE.get(domain)
    if cached:
        if time.time() < cached["expires_at"] - _EXPIRY_BUFFER_SEC:
            logger.debug(f"Using cached Keycloak token for domain {domain}")
            return cached["token"]
        else:
            logger.debug(f"Cached Keycloak token for domain {domain} is expired or nearing expiry.")

    # 2. Resolve credentials
    import os

    url = ""
    client_id = ""
    client_secret = ""

    if domain == "ADM":
        url = ENV.adm_keycloak_server_url
        client_id = ENV.adm_keycloak_client_id
        client_secret = ENV.adm_keycloak_client_secret or os.getenv("ADM_KEYCLOAK_CLIENT_SECRET", "")
    elif domain == "OPS":
        url = ENV.ops_keycloak_server_url
        client_id = ENV.ops_keycloak_client_id
        client_secret = os.getenv("OPS_KEYCLOAK_CLIENT_SECRET", "")

    # Fallback: use main KEYCLOAK_* vars (single-realm setup where ADM_KEYCLOAK_* is not configured)
    if not url or not client_id or not client_secret:
        base_url = os.getenv("KEYCLOAK_SERVER_URL", "").rstrip("/")
        realm = os.getenv("KEYCLOAK_REALM", "")
        fb_client_id = os.getenv("KEYCLOAK_CLIENT_ID", "")
        fb_client_secret = os.getenv("KEYCLOAK_CLIENT_SECRET", "")
        if base_url and realm and fb_client_id and fb_client_secret:
            url = f"{base_url}/realms/{realm}/protocol/openid-connect/token"
            client_id = fb_client_id
            client_secret = fb_client_secret
            logger.debug(f"ADM_KEYCLOAK_* not set — falling back to main KEYCLOAK_* vars for domain {domain}")

    # Further fallback: DB profile
    if not url or not client_id or not client_secret:
        profile = db.scalar(select(DomainAuthProfileModel).where(DomainAuthProfileModel.domain_type == domain))
        if profile and profile.enabled and profile.profile_metadata:
            metadata = profile.profile_metadata
            url = profile.issuer_url or metadata.get("token_endpoint", "")
            client_id = profile.client_id
            client_secret = metadata.get("client_secret", "")

    if not url or not client_id or not client_secret:
        logger.warning(f"Missing Keycloak auth profile or credentials for domain: {domain}")
        return None

    # Ensure URL is the token endpoint. If they provided just the realm, this might be tricky,
    # but based on plan we assume ADM_KEYCLOAK_SERVER_URL is the full token endpoint.
    if not url.endswith("/token") and "/protocol/openid-connect" not in url:
         logger.warning(f"Keycloak URL for domain {domain} does not look like a token endpoint: {url}")
         # We could try to append /protocol/openid-connect/token but we will trust the env var for now.

    # 3. Fetch from Keycloak
    logger.info(f"Fetching new Keycloak token for domain {domain} from {url}")
    
    async with httpx.AsyncClient(verify=ENV.keycloak_verify_ssl) as client:
        try:
            payload = {
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            }
            # Keycloak requires application/x-www-form-urlencoded
            response = await client.post(url, data=payload, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            
            token = data.get("access_token")
            expires_in = data.get("expires_in", 300) # Default to 5 mins if not provided

            if token:
                _TOKEN_CACHE[domain] = {
                    "token": token,
                    "expires_at": time.time() + expires_in
                }
                logger.info(f"Successfully cached new Keycloak token for domain {domain}")
                return token
            else:
                logger.error(f"Keycloak response missing access_token for domain {domain}")
                return None
                
        except httpx.HTTPStatusError as exc:
            logger.error(f"Keycloak HTTP error for domain {domain}: {exc.response.status_code} - {exc.response.text}")
            return None
        except Exception as exc:
            logger.error(f"Failed to fetch Keycloak token for domain {domain}: {exc}")
            return None

