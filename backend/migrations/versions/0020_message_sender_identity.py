"""Record the user or patient portal account that sent a message."""

from alembic import op
import sqlalchemy as sa


revision = "0020_message_sender_identity"
down_revision = "0019_availability_and_schedules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("patient_messages")}
    if "sender_user_id" not in columns:
        op.add_column(
            "patient_messages",
            sa.Column("sender_user_id", sa.Uuid(), nullable=True),
        )
        if bind.dialect.name == "postgresql":
            op.create_foreign_key(
                "fk_patient_messages_sender_user_id_users",
                "patient_messages",
                "users",
                ["sender_user_id"],
                ["id"],
            )
        op.create_index(
            "ix_patient_messages_sender_user_id",
            "patient_messages",
            ["sender_user_id"],
        )
    if "sender_portal_account_id" not in columns:
        op.add_column(
            "patient_messages",
            sa.Column("sender_portal_account_id", sa.Uuid(), nullable=True),
        )
        if bind.dialect.name == "postgresql":
            op.create_foreign_key(
                "fk_patient_messages_sender_portal_account_id",
                "patient_messages",
                "patient_portal_accounts",
                ["sender_portal_account_id"],
                ["id"],
            )
        op.create_index(
            "ix_patient_messages_sender_portal_account_id",
            "patient_messages",
            ["sender_portal_account_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("patient_messages")}
    if "sender_portal_account_id" in columns:
        op.drop_index(
            "ix_patient_messages_sender_portal_account_id",
            table_name="patient_messages",
        )
        if bind.dialect.name == "postgresql":
            op.drop_constraint(
                "fk_patient_messages_sender_portal_account_id",
                "patient_messages",
                type_="foreignkey",
            )
        op.drop_column("patient_messages", "sender_portal_account_id")
    if "sender_user_id" in columns:
        op.drop_index(
            "ix_patient_messages_sender_user_id",
            table_name="patient_messages",
        )
        if bind.dialect.name == "postgresql":
            op.drop_constraint(
                "fk_patient_messages_sender_user_id_users",
                "patient_messages",
                type_="foreignkey",
            )
        op.drop_column("patient_messages", "sender_user_id")
