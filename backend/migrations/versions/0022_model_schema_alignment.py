"""Align production schema with current user, patient, and encounter models."""

from alembic import op
import sqlalchemy as sa


revision = "0022_model_schema_alignment"
down_revision = "0021_patient_message_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "users" in tables:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "department" not in user_columns:
            op.add_column(
                "users",
                sa.Column("department", sa.String(120), nullable=False, server_default=""),
            )
        if "project" not in user_columns:
            op.add_column(
                "users",
                sa.Column("project", sa.String(120), nullable=False, server_default=""),
            )
        if "email_verified" not in user_columns:
            op.add_column(
                "users",
                sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
            )

    if "patients" in tables:
        patient_columns = {column["name"] for column in inspector.get_columns("patients")}
        if "department" not in patient_columns:
            op.add_column(
                "patients",
                sa.Column("department", sa.String(120), nullable=False, server_default=""),
            )
        if "project" not in patient_columns:
            op.add_column(
                "patients",
                sa.Column("project", sa.String(120), nullable=False, server_default=""),
            )

    if "encounters" in tables:
        encounter_columns = {column["name"] for column in inspector.get_columns("encounters")}
        if "deleted_at" not in encounter_columns:
            op.add_column(
                "encounters",
                sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            )
            op.create_index("ix_encounters_deleted_at", "encounters", ["deleted_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "encounters" in tables:
        encounter_columns = {column["name"] for column in inspector.get_columns("encounters")}
        if "deleted_at" in encounter_columns:
            op.drop_index("ix_encounters_deleted_at", table_name="encounters")
            op.drop_column("encounters", "deleted_at")

    if "patients" in tables:
        patient_columns = {column["name"] for column in inspector.get_columns("patients")}
        if "project" in patient_columns:
            op.drop_column("patients", "project")
        if "department" in patient_columns:
            op.drop_column("patients", "department")

    if "users" in tables:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "email_verified" in user_columns:
            op.drop_column("users", "email_verified")
        if "project" in user_columns:
            op.drop_column("users", "project")
        if "department" in user_columns:
            op.drop_column("users", "department")
