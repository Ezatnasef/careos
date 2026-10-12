"""Store patient preferred name and language on their profile."""

from alembic import op
import sqlalchemy as sa


revision = "0017_patient_registration_profile"
down_revision = "0016_remove_clinical_rag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "patient_profiles",
        sa.Column("preferred_name", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "patient_profiles",
        sa.Column(
            "preferred_language",
            sa.String(length=12),
            nullable=False,
            server_default="ar",
        ),
    )


def downgrade() -> None:
    op.drop_column("patient_profiles", "preferred_language")
    op.drop_column("patient_profiles", "preferred_name")
