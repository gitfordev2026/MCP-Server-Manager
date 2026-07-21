from typing import Any


def write_audit_log(
    db,
    audit_model,
    *,
    actor: str,
    action: str,
    resource_type: str,
    resource_id: str,
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any] | None = None,
) -> None:
    db.add(
        audit_model(
            actor=actor or "system",
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            before_state=before_state,
            after_state=after_state,
        )
    )

