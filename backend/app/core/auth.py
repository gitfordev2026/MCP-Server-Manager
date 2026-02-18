import os

KEYCLOAK_SERVER_URL = os.getenv("KEYCLOAK_SERVER_URL", "").rstrip("/")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "")
KEYCLOAK_VERIFY_AUD = os.getenv("KEYCLOAK_VERIFY_AUD", "true").lower() == "true"
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() == "true"

if KEYCLOAK_SERVER_URL and KEYCLOAK_REALM:
    KEYCLOAK_ISSUER = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}"
    KEYCLOAK_JWKS_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"
else:
    KEYCLOAK_ISSUER = ""
    KEYCLOAK_JWKS_URL = ""
