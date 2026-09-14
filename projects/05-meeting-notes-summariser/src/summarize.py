"""Extracts a structured MeetingSummary from a raw transcript.

The schema constraint (via `.with_structured_output`) guarantees the output
*parses* — every summary you get back is a valid MeetingSummary. It does
NOT guarantee the output is *truthful*: a model can satisfy the schema
perfectly while inventing an owner or due date that was never mentioned.
That's what src/grounding.py checks for separately, after extraction.
"""

from .llm import get_chat_model
from .schema import MeetingSummary

SYSTEM_PROMPT = """You summarize meeting transcripts into structured notes.

Extract:
- summary: a 2-4 sentence overview of what was discussed.
- key_decisions: specific decisions that were made.
- action_items: concrete follow-up tasks. For each one, set owner and \
due_date ONLY if the transcript explicitly states them. If no owner was \
stated, leave owner null — do not guess based on who was speaking or who \
seems responsible. If no date was stated, leave due_date null — do not \
invent or infer one.

The transcript may be messy: filler words ("um", "uh"), interruptions, \
unclear speaker turns. Extract the substance and ignore the noise, but \
never use messiness as an excuse to fill in a detail that wasn't actually \
said."""


class Summarizer:
    def __init__(self):
        self._structured_model = None

    def _get_structured_model(self):
        if self._structured_model is None:
            self._structured_model = get_chat_model().with_structured_output(MeetingSummary)
        return self._structured_model

    def summarize(self, transcript: str) -> MeetingSummary:
        return self._get_structured_model().invoke(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": transcript},
            ]
        )
