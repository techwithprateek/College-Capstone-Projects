# Meeting Notes Summariser

Paste a messy meeting transcript, get back a clean summary, key decisions,
and action items with owners and due dates — as structured data, not a
paragraph you have to re-read to extract the actual to-dos from.

The interesting engineering problem here isn't summarization — it's making
sure the model doesn't invent details. Schema validation guarantees the
output is *well-formed*; it says nothing about whether it's *true*. This
project treats those as two separate problems.

## Proof it doesn't hallucinate, not just a claim

`data/sample_transcripts/messy_budget_meeting.txt` contains this exchange:

```
Jordan: someone needs to dig into the infra overspend. I don't think we assigned it.
Alex: yeah no one's on it yet.
```

Two named speakers are right there in the transcript — an easy trap for a
model to fall into by assigning the task to whichever of them it defaults
to. Real output from `eval/run_eval.py` against the actual API:

```
- Investigate the cause of the 12% overspend on the infrastructure line item.
  owner=None due=None
[PASS] an unassigned action item was correctly left unassigned
```

`owner` and `due_date` are genuinely `Optional[str] = None` in the Pydantic
schema (`src/schema.py`), and the prompt explicitly instructs the model to
leave them null rather than guess (`src/summarize.py`). This transcript
exists specifically to verify that holds under real conditions, not just in
the prompt's wording.

## The second layer: grounding checks

Even with that instruction, nothing *guarantees* the model won't
hallucinate a field on some other transcript. `src/grounding.py` adds an
independent, deterministic check — no extra LLM call — that flags any
non-null `owner` or `due_date` whose words don't actually show up anywhere
in the source transcript. It's a heuristic (word-overlap, not exact
match, so a paraphrase like "Friday" for "end of day Fri." isn't
falsely flagged) but it's a real second line of defense, and the app
surfaces any warning directly next to the flagged field with a ⚠️ rather
than presenting every extracted value with equal, undeserved confidence.

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

Click one of the example transcripts in the sidebar, or paste your own,
then click Summarize.

## Run the tests

```bash
pytest
```

13 tests, all offline — no API key required. `test_schema.py` covers the
Pydantic model (owner/due_date default to `None`, never something a caller
has to remember to check for). `test_grounding.py` proves the hallucination
detector actually catches something — using hand-built `MeetingSummary`
objects with a deliberately fabricated owner/date against a fixed
transcript, since you can't reliably make a well-behaved LLM hallucinate on
demand to test the detector against. `test_summarize.py` uses
`FakeStructuredChatModel` (mimics `.with_structured_output()` by returning
a pre-built schema instance from `invoke()`) to test the pipeline's
plumbing and its lazy initialization (constructing a `Summarizer` never
requires an API key — only calling `.summarize()` does).

## Run the eval (optional, costs a few cents)

```bash
python eval/run_eval.py
```

Runs both bundled transcripts through the real API and checks 8 things:
expected decisions and action-item owners/dates were captured correctly on
the clean transcript, the ambiguous action item was correctly left
unassigned on the messy one, and zero grounding warnings fired on either
(real run: **8/8 passed**).

## Project layout

```
src/
  schema.py         Pydantic models — owner/due_date genuinely Optional
  llm.py              provider wrapper
  summarize.py          the extraction pipeline (lazy-initialized)
  grounding.py             independent hallucination check, no LLM call
data/sample_transcripts/    2 examples: one clean, one deliberately ambiguous
eval/                         golden-set harness against the real API
tests/                          13 offline tests
```

## Where this is intentionally scoped down

- **No batch mode.** Summarizing a folder of transcripts and exporting to
  CSV is a natural extension — the core `Summarizer` class already supports
  it (call `.summarize()` in a loop), just no CLI wrapper for it here.
- **`due_date` is free text, not a parsed date.** Transcripts say things
  like "next Friday" or "EOD Wednesday" — normalizing that to an actual
  calendar date needs to know today's date and could easily get a date
  wrong in a way that's worse than just showing the speaker's own words.
  Kept as stated, deliberately.
- **The grounding check is a heuristic, not a guarantee.** Word overlap
  catches an obviously invented name or date; it wouldn't catch a subtler
  hallucination that happens to reuse words already in the transcript. A
  stronger version would ask a second LLM call to verify groundedness —
  more accurate, more expensive, and outside this project's scope.
