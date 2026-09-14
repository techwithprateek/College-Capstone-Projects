from src.memory import ConversationHistory
from src.query_rewrite import rewrite_standalone_question, summarize_turns

from .fakes import FakeChatModel


def test_rewrite_skips_the_llm_call_on_an_empty_history():
    history = ConversationHistory()
    chat_model = FakeChatModel(responses=[])  # would raise if invoke() is called

    result = rewrite_standalone_question(chat_model, history, "What is Northwind Robotics?")

    assert result == "What is Northwind Robotics?"
    assert chat_model.call_log == []


def test_rewrite_calls_the_llm_and_returns_its_rewritten_question():
    history = ConversationHistory()
    history.add_turn(
        "What is Northwind Robotics' remote work policy?",
        "Employees may work remotely up to 2 days per week.",
    )
    chat_model = FakeChatModel(
        responses=["How many days per week can employees work remotely?"]
    )

    result = rewrite_standalone_question(chat_model, history, "How many days is that per week?")

    assert result == "How many days per week can employees work remotely?"
    # the prior turn must actually have been sent to the LLM to rewrite against
    sent_content = chat_model.call_log[0][1].content
    assert "remote work policy" in sent_content
    assert "How many days is that per week?" in sent_content


def test_summarize_turns_includes_prior_summary_when_present():
    chat_model = FakeChatModel(responses=["user discussed pricing and support"])
    from src.memory import Turn

    result = summarize_turns(chat_model, "user asked about pricing", [Turn("And support?", "Included.")])

    assert result == "user discussed pricing and support"
    sent_content = chat_model.call_log[0][1].content
    assert "user asked about pricing" in sent_content
    assert "And support?" in sent_content
