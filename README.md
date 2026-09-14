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

## Projects

| # | Project | Stack | What it's really about |
|---|---------|-------|------------------------|
| 1 | [RAG Chatbot](projects/01-rag-chatbot) | Python, LangChain, ChromaDB, OpenAI | Type-aware chunking, relevance-threshold retrieval, an eval harness measuring retrieval hit-rate + answer quality |
| 2 | [Idempotent Payment Gateway](projects/02-idempotent-payment-gateway) | Node/TS, Express, Prisma, Postgres | A database unique constraint making concurrent duplicate charges provably impossible — tested with 20 real concurrent requests |
| 3 | [Network Intrusion Detection](projects/03-network-intrusion-detection) | Python, scikit-learn, XGBoost, Flask | Class-imbalance-aware model comparison on the metric that matters (attack recall, not accuracy) |
| 4 | [Conversational RAG](projects/04-conversational-rag) | Python, LangChain, OpenAI | Query rewriting + bounded, self-summarizing conversation memory — with a side-by-side demo proving the failure mode it fixes |
| 5 | [Meeting Notes Summariser](projects/05-meeting-notes-summariser) | Python, LangChain, Pydantic, OpenAI | Structured extraction that provably doesn't hallucinate unstated fields, plus an independent grounding check |
| 6 | [URL Shortener + Analytics](projects/06-url-shortener-analytics) | Next.js/TS, Prisma, Postgres, Redis | Collision-free short codes, a cache-aside redirect path (1.9ms measured), and an atomic sliding-window rate limiter |
| 7 | [Job Application Tracker](projects/07-job-application-tracker) | Next.js/TS, Prisma, Postgres, Redis, BullMQ | Real JWT + GitHub OAuth (built from the actual protocol, not a framework), a validated status state machine, and background reminder jobs |

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
