from src.grounding import check_grounding
from src.schema import ActionItem, MeetingSummary

TRANSCRIPT = """
Jordan: someone needs to dig into the infra overspend. I don't think we assigned it.
Alex: yeah no one's on it yet.
Jordan: we did decide to freeze new hires for the rest of the quarter.
"""


def test_no_warnings_when_owner_and_due_date_are_null():
    summary = MeetingSummary(
        summary="Discussed infra overspend and hiring freeze.",
        action_items=[ActionItem(description="Investigate infra overspend")],
    )

    assert check_grounding(summary, TRANSCRIPT) == []


def test_no_warnings_when_fields_genuinely_appear_in_transcript():
    summary = MeetingSummary(
        summary="Discussed hiring freeze.",
        action_items=[ActionItem(description="Freeze hiring", owner="Jordan", due_date="rest of the quarter")],
    )

    assert check_grounding(summary, TRANSCRIPT) == []


def test_flags_a_hallucinated_owner_not_in_the_transcript():
    summary = MeetingSummary(
        summary="Discussed infra overspend.",
        action_items=[ActionItem(description="Investigate infra overspend", owner="Priya")],
    )

    warnings = check_grounding(summary, TRANSCRIPT)

    assert len(warnings) == 1
    assert warnings[0].field == "action_item.owner"
    assert warnings[0].value == "Priya"


def test_flags_a_hallucinated_due_date_not_in_the_transcript():
    summary = MeetingSummary(
        summary="Discussed infra overspend.",
        action_items=[ActionItem(description="Investigate infra overspend", due_date="next Friday")],
    )

    warnings = check_grounding(summary, TRANSCRIPT)

    assert len(warnings) == 1
    assert warnings[0].field == "action_item.due_date"


def test_paraphrased_but_genuinely_grounded_values_are_not_flagged():
    # A near-verbatim paraphrase of transcript wording shouldn't be flagged
    # just because it isn't an exact substring match.
    summary = MeetingSummary(
        summary="...",
        action_items=[ActionItem(description="Freeze hiring", owner="Jordan", due_date="the rest of the quarter")],
    )

    assert check_grounding(summary, TRANSCRIPT) == []
