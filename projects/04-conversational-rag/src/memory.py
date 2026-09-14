"""Tracks conversation history across turns, with a token budget.

A naive implementation just appends every turn to a list forever and stuffs
the whole thing into every prompt — which quietly breaks on a long
conversation (context window overflow, rising cost and latency per turn).
Once the history grows past `max_tokens`, the oldest turn is collapsed into
a running summary instead of being kept verbatim or silently dropped, so
the pipeline still remembers *that* something was discussed, without paying
to re-send the full text of it on every subsequent turn.
"""

from dataclasses import dataclass, field
from typing import Callable

import tiktoken

_ENCODING = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(_ENCODING.encode(text))


@dataclass
class Turn:
    question: str
    answer: str


SummarizerFn = Callable[[str | None, list[Turn]], str]


@dataclass
class ConversationHistory:
    max_tokens: int = 800
    turns: list[Turn] = field(default_factory=list)
    summary: str | None = None

    def is_empty(self) -> bool:
        return not self.turns and self.summary is None

    def add_turn(self, question: str, answer: str) -> None:
        self.turns.append(Turn(question, answer))

    def format_for_prompt(self) -> str:
        parts = []
        if self.summary:
            parts.append(f"[Summary of earlier conversation: {self.summary}]")
        for turn in self.turns:
            parts.append(f"User: {turn.question}\nAssistant: {turn.answer}")
        return "\n\n".join(parts)

    def token_count(self) -> int:
        return count_tokens(self.format_for_prompt())

    def needs_summarization(self) -> bool:
        return self.token_count() > self.max_tokens

    def collapse_oldest_turn(self, summarize: SummarizerFn) -> bool:
        """Moves the single oldest turn out of `turns` and into `summary`.

        Always keeps at least the most recent turn verbatim — a follow-up
        question almost always refers to the immediately preceding answer,
        so that one turn must never get flattened into a summary. Returns
        False (and does nothing) when only one turn is left.
        """
        if len(self.turns) <= 1:
            return False
        oldest = self.turns.pop(0)
        self.summary = summarize(self.summary, [oldest])
        return True

    def enforce_budget(self, summarize: SummarizerFn) -> None:
        while self.needs_summarization():
            collapsed = self.collapse_oldest_turn(summarize)
            if not collapsed:
                break
