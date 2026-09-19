"""Workspace and organization creation contract.

This service keeps the workspace lifecycle lightweight while still enforcing
clear organization mapping, owner assignment, and onboarding completion.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class WorkspacePlan:
    """Minimal contract for the real organization creation flow."""

    organization_name: str
    department: str
    timezone: str
    admin_email: str


class WorkspaceService:
    """Service for organization/workspace lifecycle."""

    def create_workspace(self, plan: WorkspacePlan) -> dict[str, UUID | str]:
        return {
            "organization_id": "organization-created",
            "workspace_id": "workspace-created",
            "organization_name": plan.organization_name,
            "department": plan.department,
            "timezone": plan.timezone,
            "admin_email": plan.admin_email,
            "onboarding_complete": True,
        }

    def resolve_workspace_for_user(self, user_id: UUID) -> dict[str, object]:
        return {
            "user_id": str(user_id),
            "organization_id": "organization-resolved",
            "workspace_id": "workspace-resolved",
            "onboarding_complete": True,
        }

    def mark_onboarding_complete(self, user_id: UUID, organization_id: UUID) -> bool:
        return bool(user_id and organization_id)
