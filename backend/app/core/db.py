import os

from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import column, create_engine, literal, select, table
from sqlalchemy.orm import sessionmaker

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SQLITE_DB_PATH = "servers.db"
SQLITE_DATABASE_URL = f"sqlite:///{SQLITE_DB_PATH}"

_configured_db_url = os.getenv("DATABASE_URL", "").strip()
_fallback_enabled = os.getenv("DB_FALLBACK_SQLITE", "true").lower() == "true"


def _ensure_pg_database_exists(url: str) -> None:
    try:
        from urllib.parse import urlparse as _urlparse

        parsed = _urlparse(url)
        db_name = parsed.path.lstrip("/")
        if not db_name:
            return

        admin_url = url.rsplit("/", 1)[0] + "/postgres"
        admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with admin_engine.connect() as conn:
            pg_database = table("pg_database", column("datname"))
            exists = conn.execute(
                select(literal(1)).select_from(pg_database).where(pg_database.c.datname == db_name)
            ).fetchone()
            if not exists:
                conn.exec_driver_sql(f'CREATE DATABASE "{db_name}"')
                print(f"[DB] Created PostgreSQL database '{db_name}'")
        admin_engine.dispose()
    except Exception as exc:
        print(f"[DB] Warning: could not auto-create database: {exc}")


def _create_pg_engine(url: str):
    try:
        _ensure_pg_database_exists(url)
        eng = create_engine(url, pool_pre_ping=True)
        with eng.connect() as conn:
            conn.execute(select(literal(1)))
        return eng
    except Exception as exc:
        print(f"[DB] PostgreSQL connection failed: {exc}")
        return None


def _setup_database():
    if _configured_db_url and _configured_db_url.startswith("postgresql"):
        pg_engine = _create_pg_engine(_configured_db_url)
        if pg_engine is not None:
            endpoint = _configured_db_url.split("@")[-1] if "@" in _configured_db_url else _configured_db_url
            print(f"[DB] Database backend: postgresql ({endpoint})")
            return pg_engine, "postgresql"

        if _fallback_enabled:
            print(f"[DB] PostgreSQL unavailable - falling back to SQLite ({SQLITE_DB_PATH})")
        else:
            raise RuntimeError(
                "PostgreSQL connection failed and DB_FALLBACK_SQLITE is disabled. "
                "Set DB_FALLBACK_SQLITE=true in .env to allow SQLite fallback."
            )

    sqlite_engine = create_engine(
        SQLITE_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    if not _configured_db_url:
        print(f"[DB] Database backend: sqlite (no DATABASE_URL configured, using {SQLITE_DB_PATH})")
    else:
        print(f"[DB] Database backend: sqlite (fallback -> {SQLITE_DB_PATH})")
    return sqlite_engine, "sqlite"


engine, DB_BACKEND = _setup_database()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
