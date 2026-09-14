"""Provider wrapper — the only place that talks to OpenAI directly.
Swap providers by changing this function's body only.
"""

import os

from langchain_openai import ChatOpenAI

CHAT_MODEL = os.getenv("SUMMARIZER_CHAT_MODEL", "gpt-4o-mini")


def get_chat_model(temperature: float = 0.0) -> ChatOpenAI:
    return ChatOpenAI(model=CHAT_MODEL, temperature=temperature)
