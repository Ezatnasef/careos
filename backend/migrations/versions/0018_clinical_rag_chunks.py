"""Restore document_chunks table for Clinical RAG guidelines and tenant-scoped patient documents."""

from alembic import op
import sqlalchemy as sa


revision = "0018_clinical_rag_chunks"
down_revision = "0017_patient_registration_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "document_chunks" in inspector.get_table_names():
        return

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("patient_id", sa.Uuid(), sa.ForeignKey("patients.id"), nullable=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("patient_documents.id"), nullable=True),
        sa.Column("chunk_id", sa.String(length=320), nullable=False),
        sa.Column("source", sa.String(length=255), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", sa.JSON(), nullable=False),
        sa.Column("source_type", sa.String(length=24), nullable=False, server_default="guideline"),
        sa.Column("ocr_applied", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ocr_engine", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chunk_id", name="uq_document_chunks_chunk_id"),
    )
    op.create_index("ix_document_chunks_organization_id", "document_chunks", ["organization_id"])
    op.create_index("ix_document_chunks_patient_id", "document_chunks", ["patient_id"])
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    op.create_index("ix_document_chunks_chunk_id", "document_chunks", ["chunk_id"], unique=True)
    op.create_index("ix_document_chunks_source", "document_chunks", ["source"])
    op.create_index("ix_document_chunks_created_at", "document_chunks", ["created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "document_chunks" not in inspector.get_table_names():
        return

    op.drop_index("ix_document_chunks_created_at", table_name="document_chunks")
    op.drop_index("ix_document_chunks_source", table_name="document_chunks")
    op.drop_index("ix_document_chunks_chunk_id", table_name="document_chunks")
    op.drop_index("ix_document_chunks_document_id", table_name="document_chunks")
    op.drop_index("ix_document_chunks_patient_id", table_name="document_chunks")
    op.drop_index("ix_document_chunks_organization_id", table_name="document_chunks")
    op.drop_table("document_chunks")

