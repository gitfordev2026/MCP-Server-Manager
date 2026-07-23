from app.env import ENV

KEYCLOAK_SERVER_URL = ENV.keycloak_server_url
KEYCLOAK_FRONTEND_URL = ENV.keycloak_frontend_url
KEYCLOAK_REALM = ENV.keycloak_realm
KEYCLOAK_CLIENT_ID = ENV.keycloak_client_id
KEYCLOAK_VERIFY_AUD = ENV.keycloak_verify_aud
KEYCLOAK_VERIFY_SSL = ENV.keycloak_verify_ssl
AUTH_ENABLED = ENV.auth_enabled

if KEYCLOAK_SERVER_URL and KEYCLOAK_REALM:
    KEYCLOAK_ISSUER = f"{KEYCLOAK_FRONTEND_URL}/realms/{KEYCLOAK_REALM}"
    KEYCLOAK_JWKS_URL = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
else:
    KEYCLOAK_ISSUER = ""
    KEYCLOAK_JWKS_URL = ""

