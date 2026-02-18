import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DEFAULT_TOOL_ID = "__default__"


def utc_now() -> datetime.datetime:
    return datetime.datetime.utcnow()


class Base(DeclarativeBase):
    pass


class ServerModel(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class BaseURLModel(Base):
    __tablename__ = "raw_apis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    openapi_path: Mapped[str] = mapped_column(String, nullable=False, default="")
    include_unreachable_tools: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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
    mode: Mapped[str] = mapped_column(String, nullable=False, default="approval")
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
    server_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("mcp_servers.id"), nullable=True)
    raw_api_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("raw_apis.id"), nullable=True)
    created_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_on: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)
