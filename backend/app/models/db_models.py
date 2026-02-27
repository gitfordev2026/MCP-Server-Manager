import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DEFAULT_TOOL_ID = "__default__"
DOMAIN_ADM = "ADM"
DOMAIN_OPS = "OPS"


def utc_now() -> datetime.datetime:
    return datetime.datetime.utcnow()


class Base(DeclarativeBase):
    pass


class ServerModel(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    url: Mapped[str] = mapped_column(String, nullable=False)
    domain_type: Mapped[str] = mapped_column(String(16), nullable=False, default=DOMAIN_ADM)
    auth_profile_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    selected_tools: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    sync_mode: Mapped[str] = mapped_column(String(24), nullable=False, default="manual")
    last_sync_status: Mapped[str] = mapped_column(String(24), nullable=False, default="never")
    last_sync_started_on: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_completed_on: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class BaseURLModel(Base):
    __tablename__ = "raw_apis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    url: Mapped[str] = mapped_column(String, nullable=False)
    domain_type: Mapped[str] = mapped_column(String(16), nullable=False, default=DOMAIN_ADM)
    auth_profile_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    selected_endpoints: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    openapi_path: Mapped[str] = mapped_column(String, nullable=False, default="")
    include_unreachable_tools: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Registry lifecycle and sync controls (single-source-of-truth owner state)
    sync_mode: Mapped[str] = mapped_column(String(24), nullable=False, default="manual")
    registry_state: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    last_sync_status: Mapped[str] = mapped_column(String(24), nullable=False, default="never")
    last_sync_started_on: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_completed_on: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    last_discovered_on: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class AccessPolicyModel(Base):
    __tablename__ = "exposed_mcp_tools"
    __table_args__ = (UniqueConstraint("owner_id", "tool_id", name="uq_exposed_owner_tool"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    server_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("mcp_servers.id"), nullable=True)
    base_url_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("raw_apis.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    group_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("groups.id"), nullable=True)
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    tool_id: Mapped[str] = mapped_column(String, nullable=False, default=DEFAULT_TOOL_ID)
    mode: Mapped[str] = mapped_column(String, nullable=False, default="deny")
    allowed_users: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    allowed_groups: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class GroupModel(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class APIServerLinkModel(Base):
    __tablename__ = "apis_server"
    __table_args__ = (UniqueConstraint("server_id", "raw_api_id", name="uq_server_raw_api"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    server_id: Mapped[int] = mapped_column(Integer, ForeignKey("mcp_servers.id"), nullable=False)
    raw_api_id: Mapped[int] = mapped_column(Integer, ForeignKey("raw_apis.id"), nullable=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class MCPToolModel(Base):
    __tablename__ = "mcp_tools"
    __table_args__ = (
        UniqueConstraint("source_type", "owner_id", "name", name="uq_mcp_tool_source_owner_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_type: Mapped[str] = mapped_column(String, nullable=False, default="mcp")
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    method: Mapped[str | None] = mapped_column(String, nullable=True)
    path: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    current_version: Mapped[str] = mapped_column(String, nullable=False, default="1.0.0")
    # Canonical registry tool identity/lifecycle fields
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    registration_state: Mapped[str] = mapped_column(String(24), nullable=False, default="selected")
    exposure_state: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    last_discovered_on: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    last_synced_on: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    source_updated_on: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    discovery_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    server_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("mcp_servers.id"), nullable=True)
    raw_api_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("raw_apis.id"), nullable=True)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class APIEndpointModel(Base):
    __tablename__ = "api_endpoints"
    __table_args__ = (UniqueConstraint("owner_id", "method", "path", name="uq_api_endpoint_owner_method_path"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    method: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    mcp_tool_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("mcp_tools.id"), nullable=True)
    current_version: Mapped[str] = mapped_column(String, nullable=False, default="1.0.0")
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    exposed_to_mcp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    exposure_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class RoleModel(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class PermissionModel(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class UserRoleModel(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), nullable=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class RolePermissionModel(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), nullable=False)
    permission_id: Mapped[int] = mapped_column(Integer, ForeignKey("permissions.id"), nullable=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String, nullable=False, default="system")
    action: Mapped[str] = mapped_column(String, nullable=False)
    resource_type: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[str] = mapped_column(String, nullable=False)
    before_state: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    after_state: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)


class ToolVersionModel(Base):
    __tablename__ = "tool_versions"
    __table_args__ = (UniqueConstraint("tool_id", "version", name="uq_tool_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tool_id: Mapped[int] = mapped_column(Integer, ForeignKey("mcp_tools.id"), nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    input_schema: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    output_schema: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class EndpointVersionModel(Base):
    __tablename__ = "endpoint_versions"
    __table_args__ = (UniqueConstraint("endpoint_id", "version", name="uq_endpoint_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    endpoint_id: Mapped[int] = mapped_column(Integer, ForeignKey("api_endpoints.id"), nullable=False)
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    method: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False, default="1.0.0")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    schema: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    exposed_to_mcp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class HealthCheckModel(Base):
    __tablename__ = "health_checks"
    __table_args__ = (UniqueConstraint("target_type", "target_id", name="uq_health_target"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    target_type: Mapped[str] = mapped_column(String, nullable=False)  # app | mcp_server
    target_id: Mapped[str] = mapped_column(String, nullable=False)
    heartbeat_url: Mapped[str | None] = mapped_column(String, nullable=True)
    interval_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    timeout_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class HealthStatusHistoryModel(Base):
    __tablename__ = "health_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    target_type: Mapped[str] = mapped_column(String, nullable=False)
    target_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)  # alive | down | maintenance
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)


class DomainAuthProfileModel(Base):
    __tablename__ = "domain_auth_profiles"
    __table_args__ = (UniqueConstraint("domain_type", name="uq_domain_auth_profiles_domain"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    domain_type: Mapped[str] = mapped_column(String(16), nullable=False)
    issuer_url: Mapped[str] = mapped_column(String, nullable=False, default="")
    realm: Mapped[str] = mapped_column(String, nullable=False, default="")
    client_id: Mapped[str] = mapped_column(String, nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    profile_metadata: Mapped[dict[str, object] | None] = mapped_column("metadata", JSON, nullable=True)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)
