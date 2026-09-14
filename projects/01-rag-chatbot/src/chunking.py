"""Chunking: split loaded Documents into retrieval-sized pieces.

PDF/TXT content is prose, so it's split by *token* count (via tiktoken) with
overlap — token count is what actually determines how much fits in an LLM's
context window, so sizing chunks by characters is a common but sloppy
approximation. CSV rows are already atomic units of meaning (one row = one
record) — splitting a row would sever a record's fields from each other for
no benefit, so CSV rows are kept as one chunk each instead.

Every chunk gets a `chunk_id` metadata field (e.g. "handbook.pdf#chunk3" or
"employees.csv#row12") that the RAG prompt uses to cite its source.
"""

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

PROSE_SPLITTER = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base",
    chunk_size=300,
    chunk_overlap=50,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def _is_csv(doc: Document) -> bool:
    return doc.metadata.get("source", "").lower().endswith(".csv")


def chunk_documents(docs: list[Document]) -> list[Document]:
    prose_docs = [d for d in docs if not _is_csv(d)]
    csv_docs = [d for d in docs if _is_csv(d)]

    chunks = PROSE_SPLITTER.split_documents(prose_docs) if prose_docs else []
    _assign_chunk_ids(chunks, label="chunk")
    _assign_chunk_ids(csv_docs, label="row")

    return chunks + csv_docs


def _assign_chunk_ids(docs: list[Document], label: str) -> None:
    counters: dict[str, int] = {}
    for doc in docs:
        source = doc.metadata.get("source", "unknown")
        idx = counters.get(source, 0)
        doc.metadata["chunk_id"] = f"{source}#{label}{idx}"
        counters[source] = idx + 1
