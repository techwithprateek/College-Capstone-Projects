"""The conversational RAG pipeline: query rewriting + retrieval + generation,
with bounded conversation memory across turns.

Each call to `ask()` does up to two LLM calls: one to rewrite the follow-up
into a standalone question (skipped on the first turn — see
query_rewrite.py), and one to generate the answer from retrieved context.
Occasionally, when the conversation has grown past its token budget, a
third call collapses the oldest turn into a running summary (memory.py).
"""

from dataclasses import dataclass
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from .chunking import chunk_documents
from .llm import get_chat_model
from .loaders import load_files
from .memory import ConversationHistory
from .query_rewrite import rewrite_standalone_question, summarize_turns
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
class ConversationalAnswer:
    answer: str
    sources: list[dict]
    standalone_question: str


class ConversationalRAGPipeline:
    def __init__(
        self,
        persist_dir: str | Path = "./chroma_db",
        top_k: int = 4,
        score_threshold: float | None = 0.25,
        history_max_tokens: int = 800,
    ):
        self.persist_dir = persist_dir
        self.top_k = top_k
        self.score_threshold = score_threshold
        self._vectorstore = None
        self._chat_model = None
        self.history = ConversationHistory(max_tokens=history_max_tokens)

    def _get_chat_model(self):
        if self._chat_model is None:
            self._chat_model = get_chat_model()
        return self._chat_model

    def ingest(self, file_paths: list[str]) -> int:
        docs = load_files(file_paths)
        chunks = chunk_documents(docs)
        if not chunks:
            raise ValueError("No content could be extracted from the given files.")

        self._vectorstore = build_vectorstore(chunks, self.persist_dir)
        return len(chunks)

    def ask(self, follow_up: str) -> ConversationalAnswer:
        if self._vectorstore is None:
            return ConversationalAnswer(
                answer=NOT_INDEXED_MESSAGE, sources=[], standalone_question=follow_up
            )

        chat_model = self._get_chat_model()
        standalone_question = rewrite_standalone_question(chat_model, self.history, follow_up)

        retrieved = search_relevant(
            self._vectorstore, standalone_question, self.top_k, self.score_threshold
        )
        if not retrieved:
            answer_text = NO_MATCH_MESSAGE
            sources: list[dict] = []
        else:
            context = "\n\n".join(
                f"[{doc.metadata.get('chunk_id', 'unknown')}]\n{doc.page_content}"
                for doc in retrieved
            )
            response = chat_model.invoke(
                [
                    SystemMessage(content=SYSTEM_PROMPT.format(context=context)),
                    HumanMessage(content=standalone_question),
                ]
            )
            answer_text = response.content
            sources = [
                {
                    "chunk_id": doc.metadata.get("chunk_id"),
                    "source": doc.metadata.get("source"),
                    "text": doc.page_content,
                }
                for doc in retrieved
            ]

        self.history.add_turn(follow_up, answer_text)
        self.history.enforce_budget(lambda summary, turns: summarize_turns(chat_model, summary, turns))

        return ConversationalAnswer(
            answer=answer_text, sources=sources, standalone_question=standalone_question
        )
