from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import select


def create_audit_router(session_local_factory, audit_log_model) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/audit-logs",
        summary="List Audit Logs",
        description="Return latest audit trail entries with before/after state snapshots. Source: backend/app/routers/audit.py",
    )
    def list_audit_logs(
        limit: int = Query(default=100, ge=1, le=1000),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            rows = db.scalars(
                select(audit_log_model)
                .order_by(audit_log_model.id.desc())
                .limit(limit)
            ).all()

        return {
            "logs": [
                {
                    "id": row.id,
                    "actor": row.actor,
                    "action": row.action,
                    "resource_type": row.resource_type,
                    "resource_id": row.resource_id,
                    "before_state": row.before_state,
                    "after_state": row.after_state,
                    "created_on": row.created_on.isoformat() if row.created_on else None,
                }
                for row in rows
            ]
        }

    return router
