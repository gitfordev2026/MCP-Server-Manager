from backend.env import ENV

KEYCLOAK_SERVER_URL = ENV.keycloak_server_url
KEYCLOAK_REALM = ENV.keycloak_realm
KEYCLOAK_CLIENT_ID = ENV.keycloak_client_id
KEYCLOAK_VERIFY_AUD = ENV.keycloak_verify_aud
AUTH_ENABLED = ENV.auth_enabled

if KEYCLOAK_SERVER_URL and KEYCLOAK_REALM:
    KEYCLOAK_ISSUER = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}"
    KEYCLOAK_JWKS_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"
else:
    KEYCLOAK_ISSUER = ""
    KEYCLOAK_JWKS_URL = ""
