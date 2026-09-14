from langchain_core.documents import Document

from src.chunking import chunk_documents


def test_prose_is_split_into_multiple_token_sized_chunks():
    long_text = "Sentence one. " * 200  # well over 300 tokens
    docs = [Document(page_content=long_text, metadata={"source": "notes.txt"})]

    chunks = chunk_documents(docs)

    assert len(chunks) > 1
    assert all(c.metadata["source"] == "notes.txt" for c in chunks)
    assert all(c.metadata["chunk_id"].startswith("notes.txt#chunk") for c in chunks)


def test_csv_rows_are_kept_atomic_not_split():
    long_row = "x" * 2000  # longer than the prose chunk size, but must not be split
    docs = [Document(page_content=long_row, metadata={"source": "data.csv"})]

    chunks = chunk_documents(docs)

    assert len(chunks) == 1
    assert chunks[0].metadata["chunk_id"] == "data.csv#row0"


def test_chunk_ids_increment_per_source():
    docs = [
        Document(page_content="short a", metadata={"source": "a.txt"}),
        Document(page_content="short b", metadata={"source": "a.txt"}),
    ]

    chunks = chunk_documents(docs)

    ids = sorted(c.metadata["chunk_id"] for c in chunks)
    assert ids == ["a.txt#chunk0", "a.txt#chunk1"]
