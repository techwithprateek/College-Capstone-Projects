# Conversational RAG

Chat with your documents like a real conversation. Ask a follow-up like
"tell me more about that" or "how many days is that per week?" and it
actually resolves what "that" means before searching — instead of running
semantic search on a pronoun that means nothing on its own.

This builds directly on the companion "RAG Chatbot" project — same
loaders/chunking/vectorstore core — adding the two things that turn
single-shot Q&A into an actual conversation: **query rewriting** and
**bounded conversation memory**.

## The problem this solves, proven, not just claimed

Real transcript from `eval/side_by_side_demo.py`, run against the bundled
sample documents:

```
Turn 1: What is Northwind Robotics' remote work policy?
  -> Employees may work remotely up to 2 days per week with manager
     approval. [employee_handbook.pdf#chunk0]

Turn 2 (follow-up): 'How many days is that per week?'

WITHOUT query rewriting — raw follow-up sent straight to retrieval:
  retrieved chunks: ['employee_handbook.pdf#chunk0']   <- found the right chunk!
  answer: I don't have enough information in the provided documents to answer that.

WITH query rewriting — this project's actual behavior:
  rewritten to: 'How many days per week are employees allowed to work
                 remotely at Northwind Robotics?'
  retrieved chunks: [...]
  answer: Employees may work remotely up to 2 days per week with manager
          approval [employee_handbook.pdf#chunk0].
```

The interesting (and honest) part: **retrieval found the right chunk even
without rewriting** — the sample knowledge base is small enough that it's
forgiving. The failure happens at *generation*: the model has the correct
context in front of it but still can't answer, because "that" doesn't mean
anything without the conversation it came from, and the system prompt
correctly refuses to guess. On a larger, less forgiving knowledge base,
this same problem would show up as a retrieval miss instead — either way,
rewriting the question before anything else happens is the fix.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

cp .env.example .env
# then edit .env and set OPENAI_API_KEY
```

## Run it

```bash
streamlit run app.py
```

Upload the bundled sample files in `data/sample/`, then try:

1. "What is Northwind Robotics' remote work policy?"
2. "How many days is that per week?"
3. "And who approves it?"

Each assistant turn after the first shows a "🔎 Searched for: ..." caption
with the rewritten question, so the rewriting step is visible, not hidden.

## Run the tests

```bash
pytest
```

27 tests, all offline. In addition to the loader/chunking/vectorstore tests
carried over from the base RAG project, this covers:

- **`test_memory.py`** — bounded conversation history: adding turns,
  collapsing the oldest turn into a summary once over budget, and the
  invariant that the most recent turn is *never* summarized away (a
  follow-up almost always refers to the immediately preceding answer).
- **`test_query_rewrite.py`** — the rewrite call is skipped entirely on an
  empty history (saves a round trip on the first question of every
  conversation), and the prior turn actually gets sent to the LLM when it's
  not.
- **`test_rag.py`** — the full conversational pipeline, using a
  `FakeChatModel` that scripts exact responses *in call order*: this is
  what proves turn 1 makes one LLM call (answer only) while turn 2 makes
  two (rewrite, then answer) — not just that the code runs, but that it
  calls the LLM the right number of times, with the right inputs, in the
  right order.

## Run the side-by-side demo (optional, costs a few cents)

```bash
python eval/side_by_side_demo.py
```

Reproduces the transcript above against the real API — the same follow-up
question, answered with and without rewriting, so you can see the failure
mode happen rather than take it on faith.

## How memory is bounded

A naive implementation appends every turn to a list forever and stuffs the
whole thing into every prompt. That quietly breaks on a long conversation —
rising cost and latency per turn, eventually a context-window overflow.

`src/memory.py`'s `ConversationHistory` tracks a token budget
(`history_max_tokens`, default 800). Once it's exceeded, the *oldest* turn
gets collapsed into a running one-sentence summary (via `summarize_turns`
in `src/query_rewrite.py`) instead of being kept verbatim or silently
dropped — so the pipeline still remembers *that* something was discussed
without paying to re-send its full text on every later turn. The most
recent turn is never summarized away, since a follow-up question almost
always refers to it directly.

## Project layout

```
src/
  loaders.py, chunking.py, vectorstore.py, llm.py   same core as the base RAG project
  memory.py             bounded conversation history + summarization
  query_rewrite.py        standalone-question rewriting + turn summarization
  rag.py                     ConversationalRAGPipeline: ties it all together
eval/side_by_side_demo.py   proves rewriting matters, against the real API
tests/                        27 offline tests, including exact-call-sequence assertions
```

## Where this is intentionally scoped down

- **No streaming responses.** Each turn waits for the full answer rather
  than streaming tokens — a reasonable UI improvement, not core to the
  conversational-memory mechanics this project is about.
- **No persistence across app restarts.** Conversation history lives in
  Streamlit's session state; closing the tab loses it. Persisting to a
  database is a natural extension once you'd actually want multi-session
  history.
- **Summary quality isn't evaluated.** The eval script proves rewriting
  works; it doesn't grade whether the running summary faithfully preserves
  everything worth keeping from a long conversation. Good next step if you
  want to push this further.
