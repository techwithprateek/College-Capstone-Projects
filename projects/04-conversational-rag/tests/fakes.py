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
    """Returns scripted responses in order, one per call to `invoke`.

    A conversational turn can trigger multiple LLM calls (rewrite, answer,
    occasionally summarize) — scripting exact responses per call, and
    raising if the pipeline calls more times than expected, is what lets
    tests assert on that call sequence precisely instead of guessing.
    """

    def __init__(self, responses: list[str] | str = "FAKE ANSWER"):
        self.responses = [responses] if isinstance(responses, str) else list(responses)
        self.call_log: list[list] = []

    def invoke(self, messages):
        self.call_log.append(messages)
        if not self.responses:
            raise AssertionError(
                f"FakeChatModel.invoke() called more times ({len(self.call_log)}) "
                "than scripted responses were provided"
            )
        return FakeChatResponse(self.responses.pop(0))

    @property
    def received_messages(self):
        """Messages from the most recent call, for tests that only care
        about one call (mirrors the single-call FakeChatModel's API)."""
        return self.call_log[-1] if self.call_log else None
