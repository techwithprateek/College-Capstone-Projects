"""A defense-in-depth check, independent of the LLM: does every non-null
`owner` and `due_date` the model extracted actually appear in the source
transcript?

Structured output (schema.py) guarantees well-formed output. It does not
guarantee truthful output — nothing stops a model from confidently naming
"Alex" as the owner of a task because Alex was talking nearby, even if the
transcript never actually assigned it to them. This is a cheap, fully
deterministic heuristic (word-overlap, not another LLM call) that flags
exactly that failure mode for a human to double-check, rather than trusting
the extraction blindly.
"""

import re
from dataclasses import dataclass

from .schema import MeetingSummary


@dataclass
class GroundingWarning:
    field: str
    value: str
    reason: str


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _appears_in(value: str, transcript: str, min_overlap: float = 0.6) -> bool:
    """True if most meaningful words in `value` (length > 2, to skip "a",
    "to", etc.) show up somewhere in `transcript`. Deliberately a fuzzy
    word-overlap check, not an exact substring match — a model paraphrasing
    "next Fri" as "Friday" shouldn't get flagged as a hallucination.
    """
    words = [w for w in _normalize(value).split() if len(w) > 2]
    if not words:
        return True

    normalized_transcript = _normalize(transcript)
    found = sum(1 for w in words if w in normalized_transcript)
    return (found / len(words)) >= min_overlap


def check_grounding(summary: MeetingSummary, transcript: str) -> list[GroundingWarning]:
    warnings = []
    for item in summary.action_items:
        if item.owner and not _appears_in(item.owner, transcript):
            warnings.append(
                GroundingWarning(
                    field="action_item.owner",
                    value=item.owner,
                    reason=f'"{item.owner}" was not found in the transcript',
                )
            )
        if item.due_date and not _appears_in(item.due_date, transcript):
            warnings.append(
                GroundingWarning(
                    field="action_item.due_date",
                    value=item.due_date,
                    reason=f'"{item.due_date}" was not found in the transcript',
                )
            )
    return warnings
