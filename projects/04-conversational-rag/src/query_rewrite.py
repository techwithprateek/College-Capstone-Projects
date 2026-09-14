"""Turns a follow-up question plus conversation history into a standalone
question — the step that lets "tell me more about that" or "how many days
is that per week?" actually retrieve the right chunks, instead of running
semantic search on a pronoun that means nothing on its own.
"""

from langchain_core.messages import HumanMessage, SystemMessage

from .memory import ConversationHistory

REWRITE_SYSTEM_PROMPT = """Given a conversation and a follow-up question, rewrite \
the follow-up as a standalone question that contains all the context needed to \
understand it without seeing the conversation.

If the follow-up question is already standalone and doesn't reference anything \
from the conversation, return it completely unchanged.

Reply with ONLY the rewritten question and nothing else — no preamble, no quotes."""


def rewrite_standalone_question(chat_model, history: ConversationHistory, follow_up: str) -> str:
    if history.is_empty():
        # Nothing to resolve pronouns/references against, and skipping this
        # call saves a round trip on the (common) very first question.
        return follow_up

    transcript = history.format_for_prompt()
    response = chat_model.invoke(
        [
            SystemMessage(content=REWRITE_SYSTEM_PROMPT),
            HumanMessage(
                content=f"Conversation so far:\n{transcript}\n\nFollow-up question: {follow_up}"
            ),
        ]
    )
    return response.content.strip()


SUMMARIZE_SYSTEM_PROMPT = """Summarize the following exchange in ONE short sentence, \
preserving any specific facts, names, or numbers mentioned. This summary will replace \
the full exchange in future context, so it must stand on its own."""


def summarize_turns(chat_model, existing_summary: str | None, turns) -> str:
    exchange = "\n".join(f"User: {t.question}\nAssistant: {t.answer}" for t in turns)
    prior = f"Earlier summary: {existing_summary}\n\n" if existing_summary else ""
    response = chat_model.invoke(
        [
            SystemMessage(content=SUMMARIZE_SYSTEM_PROMPT),
            HumanMessage(content=f"{prior}New exchange to fold in:\n{exchange}"),
        ]
    )
    return response.content.strip()
