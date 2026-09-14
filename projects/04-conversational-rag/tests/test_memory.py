from src.memory import ConversationHistory, Turn


def test_new_history_is_empty():
    history = ConversationHistory()
    assert history.is_empty()
    assert history.format_for_prompt() == ""


def test_add_turn_makes_history_non_empty():
    history = ConversationHistory()
    history.add_turn("What is X?", "X is Y.")

    assert not history.is_empty()
    assert "What is X?" in history.format_for_prompt()
    assert "X is Y." in history.format_for_prompt()


def test_summary_is_included_in_formatted_prompt():
    history = ConversationHistory(summary="the user asked about pricing")
    history.add_turn("And support?", "24/7 support is included.")

    formatted = history.format_for_prompt()
    assert "pricing" in formatted
    assert "24/7 support" in formatted


def test_collapse_oldest_turn_keeps_at_least_one_turn_verbatim():
    history = ConversationHistory()
    history.add_turn("Q1", "A1")

    summarizer_calls = []
    collapsed = history.collapse_oldest_turn(
        lambda summary, turns: summarizer_calls.append(turns) or "should not be called"
    )

    assert collapsed is False
    assert len(history.turns) == 1
    assert summarizer_calls == []


def test_collapse_oldest_turn_moves_one_turn_into_summary():
    history = ConversationHistory()
    history.add_turn("Q1", "A1")
    history.add_turn("Q2", "A2")

    def fake_summarize(existing_summary, turns):
        assert existing_summary is None
        assert turns == [Turn("Q1", "A1")]
        return "user asked Q1"

    collapsed = history.collapse_oldest_turn(fake_summarize)

    assert collapsed is True
    assert history.summary == "user asked Q1"
    assert len(history.turns) == 1
    assert history.turns[0].question == "Q2"


def test_enforce_budget_collapses_until_under_budget_or_one_turn_left():
    # max_tokens=1 forces summarization to trigger immediately
    history = ConversationHistory(max_tokens=1)
    history.add_turn("Q1", "A1")
    history.add_turn("Q2", "A2")
    history.add_turn("Q3", "A3")

    calls = []

    def fake_summarize(existing_summary, turns):
        calls.append(turns[0].question)
        return f"summary after {turns[0].question}"

    history.enforce_budget(fake_summarize)

    # collapses down to exactly one turn left (the most recent), never zero
    assert len(history.turns) == 1
    assert history.turns[0].question == "Q3"
    assert calls == ["Q1", "Q2"]
    assert history.summary == "summary after Q2"


def test_enforce_budget_does_nothing_when_under_budget():
    history = ConversationHistory(max_tokens=10_000)
    history.add_turn("Q1", "A1")

    def fail_if_called(existing_summary, turns):
        raise AssertionError("summarizer should not be called when under budget")

    history.enforce_budget(fail_if_called)

    assert len(history.turns) == 1
