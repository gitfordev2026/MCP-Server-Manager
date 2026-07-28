"""User Feedback & Rating API Router (Admin Protected).

Endpoints:
- POST /api/feedback: Save user feedback & 1-5 star rating
- GET /api/admin/feedback: Fetch all feedback submissions (Admin only)
"""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.rbac import get_request_actor, require_role
from app.models.db_models import FeedbackModel, UserModel
from app.core.logger import get_logger

logger = get_logger(__name__)


class FeedbackCreateRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Star rating between 1 and 5")
    feedback_text: str | None = None


def create_feedback_router(session_local_factory) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/api/feedback",
        summary="Submit User Feedback & Rating",
        description="Saves a user rating and feedback submission before logout.",
    )
    def submit_feedback(
        payload: FeedbackCreateRequest,
        actor: dict[str, Any] = Depends(get_request_actor),
    ) -> dict[str, Any]:
        username = actor.get("username") or "anonymous"
        
        # If rating is invalid or empty, return early without error
        if payload.rating < 1 or payload.rating > 5:
            return {"status": "skipped", "message": "Invalid rating range; skipped saving."}

        with session_local_factory() as db:
            # Match user in UserModel
            user_row = db.scalar(select(UserModel).where(UserModel.username == username))
            user_db_id = user_row.id if user_row else None

            feedback_entry = FeedbackModel(
                user_id=user_db_id,
                username=username,
                rating=payload.rating,
                feedback_text=payload.feedback_text.strip() if payload.feedback_text else None,
            )
            db.add(feedback_entry)
            db.commit()
            db.refresh(feedback_entry)

            logger.info(f"[Feedback] Saved {payload.rating}-star feedback from {username}")

            return {
                "status": "success",
                "id": feedback_entry.id,
                "username": username,
                "rating": payload.rating,
            }

    @router.get(
        "/api/admin/feedback",
        summary="Get All User Feedbacks (Admin Only)",
        description="Returns all submitted feedback entries and star ratings for system administrators.",
    )
    def get_all_feedbacks(
        actor: dict[str, Any] = Depends(require_role(["admin"])),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            rows = db.scalars(
                select(FeedbackModel).order_by(FeedbackModel.created_on.desc())
            ).all()

            feedbacks_list = [
                {
                    "id": r.id,
                    "user_id": r.user_id,
                    "username": r.username,
                    "rating": r.rating,
                    "feedback_text": r.feedback_text or "",
                    "created_on": r.created_on.isoformat() if r.created_on else "",
                }
                for r in rows
            ]

            # Compute statistics summary
            total_count = len(feedbacks_list)
            avg_rating = (
                round(sum(r["rating"] for r in feedbacks_list) / total_count, 1)
                if total_count > 0
                else 0.0
            )

            return {
                "total_count": total_count,
                "average_rating": avg_rating,
                "feedbacks": feedbacks_list,
            }

    return router
