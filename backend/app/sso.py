"""Hospital SSO integration placeholder.

This module is the dedicated extension point for real hospital identity
provider integration. It should eventually connect to OIDC/SAML or an
internal identity provider and return normalized claims that the backend
can map to an Organization, Workspace, and User.

Implementation order for the specialist:
1. Accept an SSO start request from the web UI.
2. Generate provider redirect URL and `state` / `nonce` values.
3. Handle callback and validate JWT / token / claims.
4. Map claims to domain -> organization -> workspace.
5. Return the authenticated user payload and onboard state.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SSOClaims:
    """Normalized claims returned from a real SSO provider."""

    email: str
    full_name: str | None = None
    given_name: str | None = None
    family_name: str | None = None
    organization_domain: str | None = None
    role: str | None = None
    provider_user_id: str | None = None


class HospitalSSOAdapter:
    """Placeholder adapter for Hospital SSO.

    Replace this class with a real OIDC/SAML adapter such as:
    - Azure AD / Entra ID
    - Okta
    - Keycloak
    - internal LDAP / OIDC gateway
    """

    def __init__(self, provider_name: str = "hospital_sso") -> None:
        self.provider_name = provider_name
        self.issuer_url = ""
        self.client_id = ""
        self.callback_url = ""

    def build_redirect_url(self, *, state: str, nonce: str) -> str:
        """Return the redirect URL for the selected identity provider.

        The placeholder intentionally raises so the specialist can replace
        this with the real provider-specific flow.
        """
        raise NotImplementedError("Implement Hospital SSO redirect generation here.")

    def exchange_code_for_claims(self, *, code: str, state: str) -> SSOClaims:
        """Swap the callback code for real identity claims.

        This function should validate the ID token, access token, and claim
        values and normalize them into `SSOClaims`.
        """
        raise NotImplementedError("Implement OIDC/SAML callback token exchange here.")

    def map_claims_to_org_workspace(self, claims: SSOClaims) -> dict[str, Any]:
        """Resolve `organization_id` and `workspace_id` from claims.

        Strategic rule: if the email domain or provider claim matches an
        organization record, the mapping should be deterministic. If not,
        create a pending invite or return an onboarding/federation error.
        """
        raise NotImplementedError("Implement claim-to-org and claim-to-workspace mapping here.")
