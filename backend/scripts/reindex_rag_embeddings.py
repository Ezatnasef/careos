"""Rebuild stored RAG vectors after changing the configured embedding model."""

import asyncio

from sqlalchemy import select

from app.db import session_factory
from app.models import DocumentChunk
from app.rag.embeddings import embed_texts


async def reindex_embeddings() -> int:
    async with session_factory() as session:
        chunks = (await session.execute(select(DocumentChunk).order_by(DocumentChunk.id))).scalars().all()
        for start in range(0, len(chunks), 64):
            batch = chunks[start : start + 64]
            vectors = embed_texts([chunk.text for chunk in batch])
            for chunk, vector in zip(batch, vectors):
                chunk.embedding = vector.tolist()
            await session.flush()
        await session.commit()
        return len(chunks)


if __name__ == "__main__":
    count = asyncio.run(reindex_embeddings())
    print(f"Reindexed {count} RAG chunks.")
