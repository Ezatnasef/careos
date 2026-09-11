"""Workspace and organization creation placeholder.

This service is meant to replace the current synthetic onboarding
experience in the front end by making a real organization/workspace
creation flow with owner assignment, team roles, and policy checks.
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
    """Placeholder service for organization/workspace lifecycle.

    Responsibilities:
    - Create organization and first workspace
    - Invite the first administrator
    - Assign default RBAC policies
    - Register onboarding completion state
    - Feed the dashboard only after workspace validation
    """

    def create_workspace(self, plan: WorkspacePlan) -> dict[str, UUID | str]:
        raise NotImplementedError("Implement organization/workspace definition here.")

    def resolve_workspace_for_user(self, user_id: UUID) -> dict[str, object]:
        raise NotImplementedError("Implement organization/workspace lookup by authenticated user here.")

    def mark_onboarding_complete(self, user_id: UUID, organization_id: UUID) -> bool:
        raise NotImplementedError("Implement onboarding completion persistence here.")
