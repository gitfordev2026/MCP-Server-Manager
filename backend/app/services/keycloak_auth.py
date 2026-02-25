import time
from typing import Any
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.env import ENV
from backend.app.models.db_models import DomainAuthProfileModel
from backend.app.core.logger import get_logger

logger = get_logger(__name__)

# Basic in-memory cache: domain_type -> {"token": str, "expires_at": float}
_TOKEN_CACHE: dict[str, dict[str, Any]] = {}

# Buffer time to refresh the token before it actually expires
_EXPIRY_BUFFER_SEC = 30


async def get_keycloak_token(domain_type: str, db: Session) -> str | None:
    """
    Fetches a Keycloak access token for the given domain using Client Credentials Grant.
    Uses in-memory caching to reuse valid tokens.
    """
    domain = domain_type.strip().upper()
    
    # 1. Check Cache
    cached = _TOKEN_CACHE.get(domain)
    if cached:
        if time.time() < cached["expires_at"] - _EXPIRY_BUFFER_SEC:
            logger.debug(f"Using cached Keycloak token for domain {domain}")
            return cached["token"]
        else:
            logger.debug(f"Cached Keycloak token for domain {domain} is expired or nearing expiry.")

    # 2. Get credentials directly from ENV (configured via domain properties)
    url = ""
    client_id = ""
    client_secret = ""

    if domain == "ADM":
        url = ENV.adm_keycloak_server_url
        client_id = ENV.adm_keycloak_client_id
        # We need to retrieve the secret from the environment.
        import os
        client_secret = os.getenv("ADM_KEYCLOAK_CLIENT_SECRET", "")
    elif domain == "OPS":
        url = ENV.ops_keycloak_server_url
        client_id = ENV.ops_keycloak_client_id
        import os
        client_secret = os.getenv("OPS_KEYCLOAK_CLIENT_SECRET", "")
    
    if not url or not client_id or not client_secret:
        # Fallback to DB if not found in env
        profile = db.scalar(select(DomainAuthProfileModel).where(DomainAuthProfileModel.domain_type == domain))
        if profile and profile.enabled and profile.profile_metadata:
            metadata = profile.profile_metadata
            url = profile.issuer_url or metadata.get("token_endpoint", "") # Assuming issuer_url maps to the token endpoint if set manually
            client_id = profile.client_id
            client_secret = metadata.get("client_secret", "")

    if not url or not client_id or not client_secret:
        logger.warning(f"Missing Keycloak missing auth profile or credentials for domain: {domain}")
        return None

    # Ensure URL is the token endpoint. If they provided just the realm, this might be tricky,
    # but based on plan we assume ADM_KEYCLOAK_SERVER_URL is the full token endpoint.
    if not url.endswith("/token") and "/protocol/openid-connect" not in url:
         logger.warning(f"Keycloak URL for domain {domain} does not look like a token endpoint: {url}")
         # We could try to append /protocol/openid-connect/token but we will trust the env var for now.

    # 3. Fetch from Keycloak
    logger.info(f"Fetching new Keycloak token for domain {domain} from {url}")
    
    async with httpx.AsyncClient() as client:
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
