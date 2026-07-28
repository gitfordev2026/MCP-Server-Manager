import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.db_models import FeatureAccessModel, RoleModel, UserRoleAssignmentModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rbac", tags=["RBAC & Access Control"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


ALL_FEATURES = [
    {"key": "playground", "name": "LLM Playground", "description": "Interactive testing environment for LLM tools"},
    {"key": "chat", "name": "AI Chat Assistant", "description": "Chat interface with multi-modal LLM agent"},
    {"key": "api_explorer", "name": "API Explorer", "description": "OpenAPI documentation catalog & interactive tester"},
    {"key": "mcp_endpoints", "name": "MCP Endpoints", "description": "MCP Tool and Streamable HTTP/SSE endpoints"},
    {"key": "admin_panel", "name": "Admin Panel", "description": "Governance dashboard for Apps, Servers, Tools & RBAC"},
]

DEFAULT_ROLES = [
    {"name": "super_admin", "description": "Full uninhibited system access to all features and administrative tools"},
    {"name": "admin", "description": "Administrative access to manage tools, endpoints, applications, and permissions"},
    {"name": "operator", "description": "Operational access to Chat, Playground, API Explorer, and MCP endpoints"},
    {"name": "read_only", "description": "View-only access to API Explorer and Chat"},
]

# Initial feature matrix defaults
DEFAULT_MATRIX = {
    "super_admin": {"playground": True, "chat": True, "api_explorer": True, "mcp_endpoints": True, "admin_panel": True},
    "admin": {"playground": True, "chat": True, "api_explorer": True, "mcp_endpoints": True, "admin_panel": True},
    "operator": {"playground": True, "chat": True, "api_explorer": True, "mcp_endpoints": True, "admin_panel": True},
    "read_only": {"playground": False, "chat": True, "api_explorer": True, "mcp_endpoints": False, "admin_panel": False},
}


class ToggleFeatureRequest(BaseModel):
    role_name: str
    feature_key: str
    is_allowed: bool


class AssignUserRoleRequest(BaseModel):
    username: str
    role_name: str


def init_rbac_defaults(db: Session):
    """Seed default roles and feature matrix if not present."""
    try:
        # Seed Roles
        for r_info in DEFAULT_ROLES:
            existing = db.scalar(select(RoleModel).where(RoleModel.name == r_info["name"]))
            if not existing:
                db.add(RoleModel(name=r_info["name"], description=r_info["description"]))

        # Seed Feature Access Matrix
        for role_name, features in DEFAULT_MATRIX.items():
            for feat_key, allowed in features.items():
                existing = db.scalar(
                    select(FeatureAccessModel).where(
                        FeatureAccessModel.role_name == role_name,
                        FeatureAccessModel.feature_key == feat_key,
                    )
                )
                if not existing:
                    db.add(FeatureAccessModel(role_name=role_name, feature_key=feat_key, is_allowed=allowed))

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding RBAC defaults: {e}")


@router.get("/features")
def get_features():
    """List all controllable system features."""
    return {"features": ALL_FEATURES}


@router.get("/roles")
def get_roles(db: Session = Depends(get_db)):
    """List all available roles in database."""
    init_rbac_defaults(db)
    roles = db.scalars(select(RoleModel)).all()
    return {
        "roles": [
            {"id": r.id, "name": r.name, "description": r.description, "created_on": r.created_on.isoformat()}
            for r in roles
        ]
    }


@router.get("/matrix")
def get_access_matrix(db: Session = Depends(get_db)):
    """Get the full Role -> Feature permission matrix."""
    init_rbac_defaults(db)
    access_records = db.scalars(select(FeatureAccessModel)).all()

    matrix: Dict[str, Dict[str, bool]] = {r["name"]: {} for r in DEFAULT_ROLES}

    for record in access_records:
        if record.role_name not in matrix:
            matrix[record.role_name] = {}
        matrix[record.role_name][record.feature_key] = record.is_allowed

    # Ensure all features exist in matrix for every role
    for role_name in matrix:
        for feat in ALL_FEATURES:
            if feat["key"] not in matrix[role_name]:
                matrix[role_name][feat["key"]] = DEFAULT_MATRIX.get(role_name, {}).get(feat["key"], True)

    return {"matrix": matrix, "features": ALL_FEATURES, "roles": DEFAULT_ROLES}


@router.post("/matrix/toggle")
def toggle_feature_access(req: ToggleFeatureRequest, db: Session = Depends(get_db)):
    """Toggle access for a specific feature on a role."""
    init_rbac_defaults(db)

    record = db.scalar(
        select(FeatureAccessModel).where(
            FeatureAccessModel.role_name == req.role_name,
            FeatureAccessModel.feature_key == req.feature_key,
        )
    )

    if record:
        record.is_allowed = req.is_allowed
    else:
        record = FeatureAccessModel(
            role_name=req.role_name,
            feature_key=req.feature_key,
            is_allowed=req.is_allowed,
        )
        db.add(record)

    db.commit()
    logger.info(f"Updated feature access: {req.role_name} -> {req.feature_key} = {req.is_allowed}")
    return {"status": "success", "role_name": req.role_name, "feature_key": req.feature_key, "is_allowed": req.is_allowed}


@router.get("/users")
def get_user_role_assignments(db: Session = Depends(get_db)):
    """List all assigned user roles."""
    assignments = db.scalars(select(UserRoleAssignmentModel)).all()

    # Default built-in users for quick selection
    user_list = [
        {"username": "admin", "role_name": "super_admin"},
        {"username": "user", "role_name": "operator"},
        {"username": "operator", "role_name": "operator"},
        {"username": "viewer", "role_name": "read_only"},
    ]

    assigned_map = {a.username: a.role_name for a in assignments}
    for u in user_list:
        if u["username"] in assigned_map:
            u["role_name"] = assigned_map[u["username"]]

    for a in assignments:
        if not any(u["username"] == a.username for u in user_list):
            user_list.append({"username": a.username, "role_name": a.role_name})

    return {"users": user_list}


@router.post("/users/role")
def assign_user_role(req: AssignUserRoleRequest, db: Session = Depends(get_db)):
    """Assign or update a role for a user."""
    existing = db.scalar(
        select(UserRoleAssignmentModel).where(UserRoleAssignmentModel.username == req.username)
    )

    if existing:
        existing.role_name = req.role_name
    else:
        existing = UserRoleAssignmentModel(username=req.username, role_name=req.role_name)
        db.add(existing)

    db.commit()
    logger.info(f"Assigned user role: {req.username} -> {req.role_name}")
    return {"status": "success", "username": req.username, "role_name": req.role_name}


@router.get("/permissions")
def get_effective_permissions(
    role: str = Query(default="super_admin"),
    username: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Get effective feature permissions for a role or username."""
    init_rbac_defaults(db)

    effective_role = role
    if username:
        assignment = db.scalar(
            select(UserRoleAssignmentModel).where(UserRoleAssignmentModel.username == username)
        )
        if assignment:
            effective_role = assignment.role_name

    records = db.scalars(
        select(FeatureAccessModel).where(FeatureAccessModel.role_name == effective_role)
    ).all()

    perms = {r.feature_key: r.is_allowed for r in records}

    # Fallback to defaults for unmapped features
    for feat in ALL_FEATURES:
        if feat["key"] not in perms:
            perms[feat["key"]] = DEFAULT_MATRIX.get(effective_role, {}).get(feat["key"], True)

    return {
        "role_name": effective_role,
        "permissions": perms,
    }
