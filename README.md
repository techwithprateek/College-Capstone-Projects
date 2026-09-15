# College Capstone Projects

Seven final-year capstone projects, each a complete, working, tested
application — not a tutorial skeleton. Every project has been verified for
real: dependencies actually installed, tests run against real databases
(not mocks), and each app's core flows exercised live against a running
server. Where a project needed external credentials this environment
doesn't have (an OpenAI key, a GitHub OAuth App, a Resend account), that's
called out explicitly in its README, along with exactly what was and
wasn't possible to verify without one.

Each project is fully self-contained — clone this repo and work from a
single subfolder, or copy just that folder out on its own.

## At a glance

| # | Project | Stack | Difficulty |
|---|---------|-------|------------|
| 1 | [RAG Chatbot](projects/01-rag-chatbot) | Python, LangChain, ChromaDB, OpenAI | Beginner → Intermediate |
| 2 | [Idempotent Payment Gateway](projects/02-idempotent-payment-gateway) | Node/TS, Express, Prisma, Postgres | Intermediate → Advanced |
| 3 | [Network Intrusion Detection](projects/03-network-intrusion-detection) | Python, scikit-learn, XGBoost, Flask | Intermediate |
| 4 | [Conversational RAG](projects/04-conversational-rag) | Python, LangChain, OpenAI | Intermediate |
| 5 | [Meeting Notes Summariser](projects/05-meeting-notes-summariser) | Python, LangChain, Pydantic, OpenAI | Beginner → Intermediate |
| 6 | [URL Shortener + Analytics](projects/06-url-shortener-analytics) | Next.js/TS, Prisma, Postgres, Redis | Intermediate |
| 7 | [Job Application Tracker](projects/07-job-application-tracker) | Next.js/TS, Prisma, Postgres, Redis, BullMQ | Intermediate → Advanced |

---

## 1. RAG Chatbot

**What it is.** Upload PDF, TXT, and CSV files and ask questions about them
in a chat UI. Every answer cites the exact chunk it came from, and the bot
says "I don't know" instead of guessing when nothing relevant was
retrieved.

**Tech stack:** Python, LangChain, ChromaDB, OpenAI (`gpt-4o-mini` +
`text-embedding-3-small`), Streamlit, pytest.

**Difficulty: Beginner → Intermediate.** The basic load → chunk → embed →
retrieve pipeline is genuinely approachable. What pushes it up a notch:
token-aware chunking (via tiktoken, not character-counting), a
relevance-score threshold so retrieval can admit "nothing relevant found,"
and a real evaluation harness scoring retrieval hit-rate and answer
quality — most tutorials stop well short of any of that.

**Why it's worth putting on a resume.** RAG is the single most
in-demand applied-AI skill in the current job market, and this is the
project every interviewer has seen a shallow version of. What sets this
one apart in an interview: you can explain *why* chunk size is measured in
tokens not characters, describe the retrieval-relevance-threshold tradeoff
from having actually tuned it, and — this is the strong one — show real
numbers from an eval script (retrieval hit-rate, answer-quality pass rate)
instead of "it seemed to work when I tried it."

## 2. Idempotent Payment Gateway

**What it is.** A `POST /charges` API that's safe to retry — fire the same
request 10 times simultaneously and exactly one charge happens, with every
caller getting back the identical response.

**Tech stack:** Node.js, TypeScript, Express, Prisma, PostgreSQL, Vitest +
Supertest, Docker Compose.

**Difficulty: Intermediate → Advanced.** Not because the endpoint is
complex — it's about 100 lines — but because *proving* it's correct under
real concurrency is a genuinely hard testing problem most projects never
attempt. This one does: 20 concurrent calls at the core mechanism, 10
concurrent HTTP requests at the actual route, both asserting exactly one
charge happened.

**Why it's worth putting on a resume.** This is the one project here
that's pure backend/distributed-systems, not AI — good if you want a
resume that reads as more than "did some AI stuff." Idempotency keys and
race-condition-safe writes are a real, frequently-interviewed system-design
topic (any company processing payments, webhooks, or retries cares about
this), and "I load-tested my own idempotency implementation under real
concurrency" is a much stronger interview answer than describing the
pattern in the abstract.

## 3. Network Intrusion Detection System

**What it is.** A classifier that labels network traffic as normal or one
of four attack categories (DoS, Probe, R2L, U2R), served live behind a
Flask app with a small web UI to test real traffic examples.

**Tech stack:** Python, scikit-learn, XGBoost, pandas, Flask, matplotlib/
seaborn, pytest.

**Difficulty: Intermediate.** Standard classifier training is
approachable; what makes this version harder (and more honest) is the
severe class imbalance in the data — one attack type is ~57% of all
traffic, several others are under 0.1% — which forces real decisions about
evaluation metrics instead of just reporting accuracy.

**Why it's worth putting on a resume.** It's the one ML project here
that isn't LLM/RAG-shaped, which matters if you're applying anywhere that
wants to see you can work with tabular data and classical ML, not just
prompt an API. The specific interview-ready story: this project explicitly
optimizes for *attack recall* over accuracy and can explain why (a missed
attack is a security incident; a false alarm is an analyst's wasted five
minutes) — "your model has 99% accuracy, is it good?" is a classic
interview trap question this project gives you a genuine, earned answer
to, backed by a real run where the rarest class hit 100% recall.

## 4. Conversational RAG

**What it is.** The RAG Chatbot, but it actually holds a conversation —
ask "how many days is that per week?" after asking about a policy, and it
correctly resolves what "that" refers to before searching, instead of
running semantic search on a pronoun.

**Tech stack:** Python, LangChain, OpenAI, Streamlit, pytest — builds
directly on Project 1's core.

**Difficulty: Intermediate.** A natural next step after Project 1, not a
starting point. The genuinely non-trivial part is bounded conversation
memory: once history grows past a token budget, older turns get collapsed
into a running summary rather than kept forever or silently dropped.

**Why it's worth putting on a resume.** Almost every "chat with your PDF"
project on a resume is the single-shot version; a chatbot that correctly
handles follow-ups is the detail that shows you went one level past a
tutorial. This project has a side-by-side demo proving the exact failure
mode it fixes — a real, captured example where the un-rewritten follow-up
gets "I don't have enough information" and the rewritten one gets the
right answer — which is a much more concrete talking point than claiming
"it supports multi-turn conversations."

## 5. Meeting Notes Summariser

**What it is.** Paste a messy meeting transcript, get back a clean
summary, key decisions, and action items with owners and due dates — as
structured data, with any field the model couldn't actually verify against
the transcript flagged rather than trusted silently.

**Tech stack:** Python, LangChain, Pydantic, OpenAI, Streamlit, pytest.

**Difficulty: Beginner → Intermediate.** The most approachable AI project
here — good first LLM project if RAG feels like a lot at once. The
non-obvious part worth the "intermediate" label: getting a model to
correctly leave a field null when the transcript genuinely doesn't say,
instead of inventing a plausible-sounding owner or date.

**Why it's worth putting on a resume.** Structured extraction from messy
unstructured text is one of the most commercially deployed LLM patterns —
support ticket triage, legal document review, CRM notes — far more
common in real jobs than open-ended chat. This project's strongest
interview material: a transcript with an action item deliberately left
unassigned in conversation ("no one's on it yet," with two named speakers
right there as a trap), verified live to come back with `owner: null`
rather than a guessed name — plus an independent, non-LLM grounding check
as a second line of defense. That's a concrete, demonstrated answer to
"how do you keep an LLM from making things up," not a claim.

## 6. URL Shortener + Analytics

**What it is.** Custom short links with click analytics (referrer, geo,
timestamp), QR code generation, link expiration, and rate-limited link
creation.

**Tech stack:** Next.js, TypeScript, Prisma, PostgreSQL, Redis, Docker
Compose, Vitest.

**Difficulty: Intermediate.** Looks like a weekend toy; the redirect
endpoint, the caching layer, and the rate limiter each hide a real design
decision. Short-code generation is collision-free by construction (base62
of the database's own autoincrement id, not random-with-retry); the
Redis cache stores enough to make a cache hit touch zero database rows on
the redirect hot path; the rate limiter is a true sliding-window log, not
the common (and subtly incorrect) fixed-window counter.

**Why it's worth putting on a resume.** "Design a URL shortener" is a
genuinely classic system-design interview question, and this project maps
onto it almost exactly — meaning you've actually built and load-tested the
thing people are usually only asked to whiteboard. The proof, not just the
claim: a live-measured 1.9ms average redirect latency on the cache-hit
path, and 30 concurrent requests against a rate limit of 10 allowing
*exactly* 10 through, which is what demonstrates the rate limiter's
check-and-increment is truly atomic rather than merely "usually correct."

## 7. Job Application Tracker

**What it is.** Track job applications through a real status pipeline
(Applied → Screening → Interview → Offer/Rejected), with automated
follow-up reminder emails and an analytics dashboard, behind real
authentication — email/password and "Sign in with GitHub."

**Tech stack:** Next.js, TypeScript, Prisma, PostgreSQL, Redis, BullMQ,
`jose` (JWT), bcrypt, Resend, Docker Compose, Vitest.

**Difficulty: Intermediate → Advanced.** The least flashy idea in this
portfolio and the one with the most real surface area: this is the only
project here with the GitHub OAuth Authorization Code flow built from the
actual protocol (not a plugged-in auth library), a background job queue
for scheduled reminders, and two distinct layers of access control (per-
user ownership checks, plus a role-gated admin view) — each independently
tested, including that a user genuinely cannot modify someone else's data.

**Why it's worth putting on a resume.** It's the most "obviously real
software" of the seven to a non-technical interviewer, and to a technical
one it's the deepest backend project here: real password hashing, a JWT
session implemented directly against `jose` rather than a framework, and
an actual OAuth2 token exchange you can explain step by step, because you
wrote each step yourself instead of configuring a library that does it
invisibly. The status pipeline is a proper validated state machine with a
full audit trail, not a free-text field — which is also what makes its
analytics correct (conversion rates computed from full status history, so
an application that reached Interview before being rejected still counts
as having reached Interview, not just "Rejected").

---

## Running any project

Each project's own README has full setup instructions, but the shape is
consistent throughout:

```bash
cd projects/0N-project-name
# Python projects:
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
# Node projects:
npm install

cp .env.example .env   # fill in whatever credentials that project needs
pytest   # or: npm test
```

Projects using Postgres/Redis (2, 6, 7) include a `docker-compose.yml` —
`docker compose up -d` gets you a working database with no local install.

## License

MIT — see [LICENSE](LICENSE).
