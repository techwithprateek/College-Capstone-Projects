"""Deterministic stand-in for a structured-output chat model, so tests run
offline with no API key and no network calls.
"""


class FakeStructuredChatModel:
    """Mimics `ChatOpenAI().with_structured_output(Schema)`: `invoke()`
    returns a pre-built schema instance directly, not a raw message.
    `with_structured_output` returns self, since this fake only ever
    produces the one response it was configured with.
    """

    def __init__(self, response):
        self.response = response
        self.received_messages = None

    def with_structured_output(self, schema):
        return self

    def invoke(self, messages):
        self.received_messages = messages
        return self.response
