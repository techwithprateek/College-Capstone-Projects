from src.schema import ActionItem, MeetingSummary
from src.summarize import Summarizer

from .fakes import FakeStructuredChatModel


def test_summarize_returns_the_structured_model_response(monkeypatch):
    expected = MeetingSummary(
        summary="Team discussed the launch timeline.",
        action_items=[ActionItem(description="Update pricing page", owner="Dev", due_date="Friday")],
    )
    fake_model = FakeStructuredChatModel(response=expected)
    monkeypatch.setattr("src.summarize.get_chat_model", lambda: fake_model)

    summarizer = Summarizer()
    result = summarizer.summarize("some transcript text")

    assert result is expected


def test_summarize_sends_the_transcript_to_the_model(monkeypatch):
    expected = MeetingSummary(summary="...")
    fake_model = FakeStructuredChatModel(response=expected)
    monkeypatch.setattr("src.summarize.get_chat_model", lambda: fake_model)

    summarizer = Summarizer()
    summarizer.summarize("Jordan: let's talk about the Q3 budget.")

    sent = fake_model.received_messages
    assert any("Q3 budget" in m["content"] for m in sent)


def test_structured_model_is_built_lazily(monkeypatch):
    """Constructing a Summarizer must never require an API key — only
    actually summarizing something should."""
    calls = []

    def fail_if_called():
        calls.append(1)
        raise AssertionError("get_chat_model should not be called by __init__")

    monkeypatch.setattr("src.summarize.get_chat_model", fail_if_called)

    Summarizer()  # should not raise

    assert calls == []
