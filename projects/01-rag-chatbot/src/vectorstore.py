"""Persistence and retrieval over a Chroma vector store.

Retrieval uses cosine similarity explicitly (rather than Chroma's raw L2
default) so relevance scores land in a well-understood 0-1 range, which is
what makes `filter_by_relevance` below a meaningful, tunable cutoff instead
of an arbitrary number.
"""

from pathlib import Path

from langchain_chroma import Chroma
from langchain_core.documents import Document

from .llm import get_embeddings

COLLECTION_METADATA = {"hnsw:space": "cosine"}


def build_vectorstore(chunks: list[Document], persist_dir: str | Path) -> Chroma:
    return Chroma.from_documents(
        documents=chunks,
        embedding=get_embeddings(),
        persist_directory=str(persist_dir),
        collection_metadata=COLLECTION_METADATA,
    )


def load_vectorstore(persist_dir: str | Path) -> Chroma:
    return Chroma(
        persist_directory=str(persist_dir),
        embedding_function=get_embeddings(),
        collection_metadata=COLLECTION_METADATA,
    )


def filter_by_relevance(
    results: list[tuple[Document, float]], threshold: float | None
) -> list[Document]:
    """Drop retrieved chunks whose relevance score falls below `threshold`.

    With cosine similarity, score is roughly "how aligned in meaning" the
    chunk is with the query, from 0 (unrelated) to 1 (near-identical). This
    is what lets the pipeline say "nothing relevant found" instead of always
    returning its top-k, even when none of them are actually relevant.
    `threshold=None` disables filtering and returns everything.
    """
    if threshold is None:
        return [doc for doc, _ in results]
    return [doc for doc, score in results if score >= threshold]


def search_relevant(
    vectorstore: Chroma, query: str, k: int, score_threshold: float | None
) -> list[Document]:
    results = vectorstore.similarity_search_with_relevance_scores(query, k=k)
    return filter_by_relevance(results, score_threshold)
