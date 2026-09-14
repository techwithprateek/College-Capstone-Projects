"""Deterministic stand-ins for OpenAI's embeddings and chat model, so tests
run offline with no API key and no network calls.
"""

import hashlib


class FakeEmbeddings:
    """Hash-based fake embeddings. Not semantically meaningful — good enough
    for tests that only need the pipeline's plumbing to work, not real
    retrieval quality (that's what eval/run_eval.py is for).
    """

    def _vector(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode()).digest()
        return [b / 255 for b in digest[:16]]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vector(text)


class FakeChatResponse:
    def __init__(self, content: str):
        self.content = content


class FakeChatModel:
    def __init__(self, response_text: str = "FAKE ANSWER"):
        self.response_text = response_text
        self.received_messages = None

    def invoke(self, messages):
        self.received_messages = messages
        return FakeChatResponse(self.response_text)
