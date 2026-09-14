"""The structured output schema. Every field the LLM is allowed to leave
unset is genuinely Optional with a None default — that's not just a typing
detail, it's what makes "the transcript didn't say who owns this" a valid
answer instead of forcing the model to invent something to satisfy the
schema.
"""

from pydantic import BaseModel, Field


class Decision(BaseModel):
    description: str = Field(description="A specific decision that was made during the meeting")


class ActionItem(BaseModel):
    description: str = Field(description="What needs to be done")
    owner: str | None = Field(
        default=None,
        description="Who is responsible, ONLY if explicitly stated in the transcript. "
        "Leave null if no owner was stated — never guess based on who was speaking.",
    )
    due_date: str | None = Field(
        default=None,
        description="When it's due, exactly as mentioned in the transcript (e.g. 'next Friday', "
        "'March 3rd') — ONLY if a date was explicitly stated. Leave null otherwise; do not invent "
        "or infer a date.",
    )


class MeetingSummary(BaseModel):
    summary: str = Field(description="A 2-4 sentence overview of what was discussed")
    key_decisions: list[Decision] = Field(default_factory=list)
    action_items: list[ActionItem] = Field(default_factory=list)
