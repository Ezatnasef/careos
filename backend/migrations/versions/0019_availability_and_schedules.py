"""Add clinician availability: schedules, overrides, and appointment clinician link."""

from alembic import op
import sqlalchemy as sa


revision = "0019_availability_and_schedules"
down_revision = "0018_clinical_rag_chunks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # ── 1. Extend appointments table ─────────────────────────────────────────
    appt_columns = {c["name"] for c in inspector.get_columns("appointments")}

    if "clinician_id" not in appt_columns:
        if bind.dialect.name == "postgresql":
            op.add_column(
                "appointments",
                sa.Column(
                    "clinician_id",
                    sa.Uuid(),
                    sa.ForeignKey("users.id"),
                    nullable=True,
                ),
            )
        else:
            op.add_column(
                "appointments",
                sa.Column(
                    "clinician_id",
                    sa.Uuid(),
                    nullable=True,
                ),
            )
        op.create_index(
            "ix_appointments_clinician_id",
            "appointments",
            ["clinician_id"],
        )

    if "duration_minutes" not in appt_columns:
        op.add_column(
            "appointments",
            sa.Column(
                "duration_minutes",
                sa.Integer(),
                nullable=False,
                server_default="30",
            ),
        )

    # ── 2. clinician_schedules ────────────────────────────────────────────────
    if "clinician_schedules" not in existing_tables:
        op.create_table(
            "clinician_schedules",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column(
                "organization_id",
                sa.Uuid(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column(
                "clinician_id",
                sa.Uuid(),
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column("day_of_week", sa.Integer(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column(
                "slot_duration_minutes",
                sa.Integer(),
                nullable=False,
                server_default="30",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "clinician_id",
                "day_of_week",
                "start_time",
                "end_time",
                name="uq_clinician_schedule_slot",
            ),
        )
        op.create_index(
            "ix_clinician_schedules_organization_id",
            "clinician_schedules",
            ["organization_id"],
        )
        op.create_index(
            "ix_clinician_schedules_clinician_id",
            "clinician_schedules",
            ["clinician_id"],
        )

    # ── 3. schedule_overrides ─────────────────────────────────────────────────
    if "schedule_overrides" not in existing_tables:
        op.create_table(
            "schedule_overrides",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column(
                "organization_id",
                sa.Uuid(),
                sa.ForeignKey("organizations.id"),
                nullable=False,
            ),
            sa.Column(
                "clinician_id",
                sa.Uuid(),
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column("override_date", sa.Date(), nullable=False),
            sa.Column(
                "is_unavailable",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column("start_time", sa.Time(), nullable=True),
            sa.Column("end_time", sa.Time(), nullable=True),
            sa.Column(
                "reason",
                sa.String(length=240),
                nullable=False,
                server_default="",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_schedule_overrides_organization_id",
            "schedule_overrides",
            ["organization_id"],
        )
        op.create_index(
            "ix_schedule_overrides_clinician_id",
            "schedule_overrides",
            ["clinician_id"],
        )
        op.create_index(
            "ix_schedule_overrides_override_date",
            "schedule_overrides",
            ["override_date"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if "schedule_overrides" in existing_tables:
        op.drop_index("ix_schedule_overrides_override_date", table_name="schedule_overrides")
        op.drop_index("ix_schedule_overrides_clinician_id", table_name="schedule_overrides")
        op.drop_index("ix_schedule_overrides_organization_id", table_name="schedule_overrides")
        op.drop_table("schedule_overrides")

    if "clinician_schedules" in existing_tables:
        op.drop_index("ix_clinician_schedules_clinician_id", table_name="clinician_schedules")
        op.drop_index("ix_clinician_schedules_organization_id", table_name="clinician_schedules")
        op.drop_table("clinician_schedules")

    appt_columns = {c["name"] for c in inspector.get_columns("appointments")}
    if "clinician_id" in appt_columns:
        op.drop_index("ix_appointments_clinician_id", table_name="appointments")
        op.drop_column("appointments", "clinician_id")
    if "duration_minutes" in appt_columns:
        op.drop_column("appointments", "duration_minutes")
