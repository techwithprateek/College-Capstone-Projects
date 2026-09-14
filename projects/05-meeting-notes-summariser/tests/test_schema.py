import pytest
from pydantic import ValidationError

from src.schema import ActionItem, Decision, MeetingSummary


def test_action_item_owner_and_due_date_default_to_none():
    item = ActionItem(description="Fix the bug")

    assert item.owner is None
    assert item.due_date is None


def test_action_item_accepts_explicit_owner_and_due_date():
    item = ActionItem(description="Fix the bug", owner="Dev", due_date="Friday")

    assert item.owner == "Dev"
    assert item.due_date == "Friday"


def test_meeting_summary_defaults_to_empty_lists():
    summary = MeetingSummary(summary="Short meeting, nothing much happened.")

    assert summary.key_decisions == []
    assert summary.action_items == []


def test_meeting_summary_requires_a_summary_field():
    with pytest.raises(ValidationError):
        MeetingSummary(key_decisions=[], action_items=[])


def test_meeting_summary_holds_nested_decisions_and_action_items():
    summary = MeetingSummary(
        summary="Team discussed budget and hiring.",
        key_decisions=[Decision(description="Freeze new hires")],
        action_items=[ActionItem(description="Investigate infra overspend")],
    )

    assert summary.key_decisions[0].description == "Freeze new hires"
    assert summary.action_items[0].owner is None
