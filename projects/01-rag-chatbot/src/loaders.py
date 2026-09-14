"""File loading: turn a PDF/TXT/CSV path into LangChain Documents.

Each loaded Document gets a `source` metadata field set to the file's name,
which downstream chunking and citation code relies on.
"""

from pathlib import Path

from langchain_community.document_loaders import CSVLoader, PyPDFLoader, TextLoader
from langchain_core.documents import Document

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".csv"}


def load_file(path: str | Path) -> list[Document]:
    path = Path(path)
    ext = path.suffix.lower()

    if ext == ".pdf":
        docs = PyPDFLoader(str(path)).load()
    elif ext == ".txt":
        docs = TextLoader(str(path), encoding="utf-8").load()
    elif ext == ".csv":
        docs = CSVLoader(str(path)).load()
    else:
        raise ValueError(
            f"Unsupported file type: {ext!r}. Supported: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    for doc in docs:
        doc.metadata["source"] = path.name
    return docs


def load_files(paths: list[str | Path]) -> list[Document]:
    docs: list[Document] = []
    for path in paths:
        docs.extend(load_file(path))
    return docs
