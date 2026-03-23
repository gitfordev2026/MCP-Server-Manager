import asyncio
import datetime
from typing import Any

import httpx
from fastapi import WebSocket

from app.core.cache import cache_delete_prefix
from app.core.db import SessionLocal
from app.core.logger import get_logger
from sqlalchemy import select
from app.models.db_models import BaseURLModel, ServerModel, HealthStatusHistoryModel
from app.services.mcp_client_runtime import list_server_tools


logger = get_logger(__name__)


class HealthEventBroadcaster:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self._clients)
        for ws in clients:
            try:
                await ws.send_json(payload)
            except Exception:
                async with self._lock:
                    self._clients.discard(ws)


health_broadcaster = HealthEventBroadcaster()


def _append_path(base_url: str, suffix: str) -> str:
    base = base_url.rstrip("/")
    return f"{base}/{suffix.lstrip('/')}"


async def _check_http(url: str, timeout_sec: float) -> tuple[bool, str | None, int]:
    started = datetime.datetime.now(datetime.UTC)
    try:
        async with httpx.AsyncClient(timeout=timeout_sec, follow_redirects=True) as client:
            health_url = _append_path(url, "health")
            try:
                response = await client.get(health_url)
                if response.status_code < 500:
                    latency = int((datetime.datetime.now(datetime.UTC) - started).total_seconds() * 1000)
                    return True, None, latency
            except Exception:
                pass

            response = await client.head(url)
            if response.status_code < 500:
                latency = int((datetime.datetime.now(datetime.UTC) - started).total_seconds() * 1000)
                return True, None, latency
            return False, f"HTTP {response.status_code}", int((datetime.datetime.now(datetime.UTC) - started).total_seconds() * 1000)
    except Exception as exc:
        latency = int((datetime.datetime.now(datetime.UTC) - started).total_seconds() * 1000)
        return False, str(exc), latency


async def _check_mcp_server(name: str, url: str, timeout_sec: float) -> tuple[bool, str | None, int]:
    started = datetime.datetime.now(datetime.UTC)
    try:
        await list_server_tools(name, url, timeout_sec=timeout_sec)
        latency = int((datetime.datetime.now(datetime.UTC) - started).total_seconds() * 1000)
        return True, None, latency
    except Exception as exc:
        latency = int((datetime.datetime.now(datetime.UTC) - started).total_seconds() * 1000)
        return False, str(exc), latency


def _status_from_failures(failures: int, failure_threshold: int) -> str:
    if failures <= 0:
        return "healthy"
    if failures >= failure_threshold:
        return "down"
    return "degraded"


def _update_app_health(
    row: BaseURLModel,
    ok: bool,
    error: str | None,
    latency_ms: int,
    failure_threshold: int,
) -> tuple[list[dict[str, Any]], HealthStatusHistoryModel | None]:
    now = datetime.datetime.now(datetime.UTC)
    events: list[dict[str, Any]] = []
    previous_status = str(getattr(row, "health_status", "unknown"))

    if ok:
        row.consecutive_failures = 0
    else:
        row.consecutive_failures = int(row.consecutive_failures or 0) + 1

    next_status = _status_from_failures(int(row.consecutive_failures or 0), failure_threshold)
    row.health_status = next_status
    row.last_health_check_at = now

    if next_status != previous_status:
        events.append(
            {
                "event": "app_recovered" if next_status == "healthy" else "app_down",
                "target_type": "application",
                "name": row.name,
                "status": next_status,
                "latency_ms": latency_ms,
                "error": error,
            }
        )

        history = HealthStatusHistoryModel(
            target_type="application",
            target_id=row.name,
            status=next_status,
            latency_ms=latency_ms,
            detail=error or "",
            created_on=now,
        )
        return events, history

    return events, None


def _update_server_health(
    row: ServerModel,
    ok: bool,
    error: str | None,
    latency_ms: int,
    failure_threshold: int,
) -> tuple[list[dict[str, Any]], HealthStatusHistoryModel | None]:
    now = datetime.datetime.now(datetime.UTC)
    events: list[dict[str, Any]] = []
    previous_status = str(getattr(row, "health_status", "unknown"))

    if ok:
        row.consecutive_failures = 0
    else:
        row.consecutive_failures = int(row.consecutive_failures or 0) + 1

    next_status = _status_from_failures(int(row.consecutive_failures or 0), failure_threshold)
    row.health_status = next_status
    row.last_health_check_at = now

    if next_status != previous_status:
        events.append(
            {
                "event": "app_recovered" if next_status == "healthy" else "app_down",
                "target_type": "mcp_server",
                "name": row.name,
                "status": next_status,
                "latency_ms": latency_ms,
                "error": error,
            }
        )

        history = HealthStatusHistoryModel(
            target_type="mcp_server",
            target_id=row.name,
            status=next_status,
            latency_ms=latency_ms,
            detail=error or "",
            created_on=now,
        )
        return events, history

    return events, None


async def run_health_monitor(
    stop_event: asyncio.Event,
    interval_sec: int = 30,
    failure_threshold: int = 3,
    timeout_sec: float = 8.0,
) -> None:
    logger.info("Health monitor started")
    while not stop_event.is_set():
        try:
            async with asyncio.TaskGroup() as tg:
                with SessionLocal() as db:
                    apps = db.scalars(select(BaseURLModel)).all()
                    servers = db.scalars(select(ServerModel)).all()

                app_tasks: list[asyncio.Task] = []
                for app in apps:
                    if app.is_deleted or not app.is_enabled:
                        continue
                    app_tasks.append(
                        tg.create_task(_check_http(app.url, timeout_sec))
                    )

                server_tasks: list[asyncio.Task] = []
                for server in servers:
                    if server.is_deleted or not server.is_enabled:
                        continue
                    server_tasks.append(
                        tg.create_task(_check_mcp_server(server.name, server.url, timeout_sec))
                    )

            # Apply results
            with SessionLocal() as db:
                app_rows = {
                    row.id: row for row in db.scalars(select(BaseURLModel)).all()
                }
                server_rows = {
                    row.id: row for row in db.scalars(select(ServerModel)).all()
                }

                events: list[dict[str, Any]] = []
                history_rows: list[Any] = []

                for app, task in zip([a for a in apps if not a.is_deleted and a.is_enabled], app_tasks):
                    ok, error, latency_ms = task.result()
                    row = app_rows.get(app.id)
                    if not row:
                        continue
                    event_list, history = _update_app_health(
                        row, ok, error, latency_ms, failure_threshold
                    )
                    events.extend(event_list)
                    if history is not None:
                        history_rows.append(history)

                for server, task in zip([s for s in servers if not s.is_deleted and s.is_enabled], server_tasks):
                    ok, error, latency_ms = task.result()
                    row = server_rows.get(server.id)
                    if not row:
                        continue
                    event_list, history = _update_server_health(
                        row, ok, error, latency_ms, failure_threshold
                    )
                    events.extend(event_list)
                    if history is not None:
                        history_rows.append(history)

                for history in history_rows:
                    db.add(history)
                db.commit()

            if events:
                cache_delete_prefix("status:")
                for payload in events:
                    await health_broadcaster.broadcast(payload)

        except Exception as exc:
            logger.error("Health monitor loop error: %s", exc)

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_sec)
        except asyncio.TimeoutError:
            continue

    logger.info("Health monitor stopped")
