"""Add soft deletion for patient messages."""

from alembic import op
import sqlalchemy as sa


revision = "0021_patient_message_soft_delete"
down_revision = "0020_message_sender_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("patient_messages"):
        return
    columns = {column["name"] for column in inspector.get_columns("patient_messages")}
    if "deleted_at" not in columns:
        op.add_column(
            "patient_messages",
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index(
            "ix_patient_messages_deleted_at",
            "patient_messages",
            ["deleted_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("patient_messages"):
        return
    columns = {column["name"] for column in inspector.get_columns("patient_messages")}
    if "deleted_at" in columns:
        op.drop_index(
            "ix_patient_messages_deleted_at",
            table_name="patient_messages",
        )
        op.drop_column("patient_messages", "deleted_at")
