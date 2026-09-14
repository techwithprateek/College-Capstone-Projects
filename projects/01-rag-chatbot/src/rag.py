"""The RAG pipeline: ingest documents, then answer questions grounded in them.

Every answer is generated from retrieved chunks only, and every source chunk
used is returned alongside the answer so the caller can show its citations —
the whole point of RAG over "just ask the model."
"""

from dataclasses import dataclass
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .chunking import chunk_documents
from .llm import get_chat_model
from .loaders import load_files
from .vectorstore import build_vectorstore, search_relevant

SYSTEM_PROMPT = """You are a document assistant. Answer the question using ONLY \
the context below. Every factual claim must end with a citation in the form \
[chunk_id], taken from the bracketed labels in the context blocks you used.

If the context does not contain the answer, say exactly: \
"I don't have enough information in the provided documents to answer that." \
Do not use outside knowledge, and do not guess.

Context:
{context}"""

NOT_INDEXED_MESSAGE = "No documents have been indexed yet. Upload files first."
NO_MATCH_MESSAGE = "I don't have enough information in the provided documents to answer that."


@dataclass
class RAGAnswer:
    answer: str
    sources: list[dict]


class RAGPipeline:
    def __init__(
        self,
        persist_dir: str | Path = "./chroma_db",
        top_k: int = 4,
        score_threshold: float | None = 0.25,
    ):
        self.persist_dir = persist_dir
        self.top_k = top_k
        self.score_threshold = score_threshold
        self._vectorstore = None
        # Built lazily (see _get_chat_model) so constructing a RAGPipeline —
        # e.g. at Streamlit page load — never requires an API key to already
        # be configured; only actually asking a question does.
        self._chat_model = None

    def _get_chat_model(self):
        if self._chat_model is None:
            self._chat_model = get_chat_model()
        return self._chat_model

    def ingest(self, file_paths: list[str]) -> int:
        """Load, chunk, and embed the given files. Returns the number of chunks indexed."""
        docs = load_files(file_paths)
        chunks = chunk_documents(docs)
        if not chunks:
            raise ValueError("No content could be extracted from the given files.")

        self._vectorstore = build_vectorstore(chunks, self.persist_dir)
        return len(chunks)

    def answer(self, question: str) -> RAGAnswer:
        if self._vectorstore is None:
            return RAGAnswer(answer=NOT_INDEXED_MESSAGE, sources=[])

        retrieved = search_relevant(
            self._vectorstore, question, self.top_k, self.score_threshold
        )
        if not retrieved:
            return RAGAnswer(answer=NO_MATCH_MESSAGE, sources=[])

        context = "\n\n".join(
            f"[{doc.metadata.get('chunk_id', 'unknown')}]\n{doc.page_content}"
            for doc in retrieved
        )
        response = self._get_chat_model().invoke(
            [
                SystemMessage(content=SYSTEM_PROMPT.format(context=context)),
                HumanMessage(content=question),
            ]
        )

        sources = [
            {
                "chunk_id": doc.metadata.get("chunk_id"),
                "source": doc.metadata.get("source"),
                "text": doc.page_content,
            }
            for doc in retrieved
        ]
        return RAGAnswer(answer=response.content, sources=sources)
