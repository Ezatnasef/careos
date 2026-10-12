"""Add tenant-scoped vector chunks for approved patient documents."""

from alembic import op
import sqlalchemy as sa


revision = "0015_patient_document_rag"
down_revision = "0014_patient_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("chunk_id", sa.String(length=320), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", sa.JSON(), nullable=False),
        sa.Column("source_type", sa.String(length=24), nullable=False),
        sa.Column("ocr_applied", sa.Boolean(), nullable=False),
        sa.Column("ocr_engine", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["patient_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chunk_id", name="uq_document_chunk_id"),
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    op.create_index("ix_document_chunks_organization_id", "document_chunks", ["organization_id"])
    op.create_index("ix_document_chunks_patient_id", "document_chunks", ["patient_id"])


def downgrade() -> None:
    op.drop_index("ix_document_chunks_patient_id", table_name="document_chunks")
    op.drop_index("ix_document_chunks_organization_id", table_name="document_chunks")
    op.drop_index("ix_document_chunks_document_id", table_name="document_chunks")
    op.drop_table("document_chunks")
