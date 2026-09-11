"""RBAC and role/permission placeholder.

This module should be the single source of truth for role checks,
resource scopes, organization-level permission mapping and clinical
feature access policy.
"""

from __future__ import annotations

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "physician": {"patient.read", "patient.write", "clinic.note", "appointment.read"},
    "nurse": {"patient.read", "patient.write", "clinic.note", "appointment.read"},
    "care_coordinator": {"patient.read", "appointment.read", "team.invite"},
    "administrator": {"patient.read", "patient.write", "team.invite", "organization.update", "audit.read"},
}

PERMISSION_MATRIX: dict[str, list[str]] = {
    "dashboard": ["dashboard.read"],
    "patients": ["patient.read", "patient.write"],
    "appointments": ["appointment.read", "appointment.write"],
    "team": ["team.invite", "team.read"],
    "audit": ["audit.read"],
}


def require_permission(permission: str, role: str) -> bool:
    """Return whether a role is allowed to perform the target permission.

    Replace the placeholder boolean model with real permission checks against
    organization scope, user attributes, workspace membership, and policy tables.
    """
    allowed = role in ROLE_PERMISSIONS and permission in ROLE_PERMISSIONS[role]
    return allowed


def get_missing_policy(role: str, permission: str) -> str:
    """Return a human-readable policy note for teams that finish the project later."""
    return f"Missing RBAC policy: role={role} permission={permission}"
