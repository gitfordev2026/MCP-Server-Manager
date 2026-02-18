from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select


def create_base_urls_router(
    session_local_factory,
    base_url_model,
    base_url_registration_model,
    normalize_openapi_path_fn: Callable[[str | None], str],
    ensure_default_access_policy_for_owner_fn,
    sync_api_server_links_by_host_fn,
    reset_openapi_catalog_fn: Callable[[], None],
    fetch_openapi_spec_from_base_url_fn,
) -> APIRouter:
    router = APIRouter()

    @router.post("/register-base-url")
    def register_base_url(
        data: base_url_registration_model,
    ) -> dict[str, Any]:
        normalized_openapi_path = normalize_openapi_path_fn(data.openapi_path)
        include_unreachable = 1 if data.include_unreachable_tools else 0
        try:
            with session_local_factory() as db:
                existing = db.scalar(select(base_url_model).where(base_url_model.name == data.name))
                if existing:
                    existing.url = data.url
                    existing.openapi_path = normalized_openapi_path
                    existing.include_unreachable_tools = include_unreachable
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"app:{existing.name}",
                        base_url_id=existing.id,
                    )
                else:
                    base_url = base_url_model(
                        name=data.name,
                        url=data.url,
                        openapi_path=normalized_openapi_path,
                        include_unreachable_tools=include_unreachable,
                    )
                    db.add(base_url)
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"app:{base_url.name}",
                        base_url_id=base_url.id,
                    )
                db.commit()

            sync_api_server_links_by_host_fn()
            reset_openapi_catalog_fn()

            return {
                "message": "Base URL registered successfully",
                "name": data.name,
                "url": data.url,
                "openapi_path": normalized_openapi_path,
                "include_unreachable_tools": bool(include_unreachable),
            }

        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get("/base-urls")
    def list_base_urls(
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        _ = current_user
        try:
            with session_local_factory() as db:
                rows = db.scalars(select(base_url_model)).all()
                base_urls = [
                    {
                        "name": row.name,
                        "url": row.url,
                        "openapi_path": row.openapi_path or "",
                        "include_unreachable_tools": bool(row.include_unreachable_tools),
                    }
                    for row in rows
                ]

            return {"base_urls": base_urls}

        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get("/openapi-spec")
    async def get_openapi_spec(
        url: str,
        openapi_path: str | None = None,
        retries: int = Query(default=0, ge=0, le=5),
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user

        try:
            return await fetch_openapi_spec_from_base_url_fn(url, openapi_path=openapi_path, retries=retries)
        except ValueError as exc:
            detail = str(exc)
            status_code = 400 if detail.startswith("URL must") else 502
            raise HTTPException(status_code=status_code, detail=detail) from exc

    return router
