# Job Application Tracker

Track every job application, its status, and follow-up reminders — nothing
slips through. The least flashy idea in this portfolio, and the most
"provably shippable" one: real authentication (password + GitHub OAuth,
both built from the actual mechanism, not a black-box library), a status
pipeline that's an actual validated state machine, and background email
reminders scheduled through a real job queue.

## What's real vs. what needs your own credentials

Everything in this project runs and is tested end-to-end **except** two
things that need external accounts this sandbox doesn't have:

- **A live GitHub OAuth round trip.** The entire flow is implemented and
  unit-tested (`lib/auth/github.ts`: authorize URL, code-for-token exchange,
  profile fetch with the private-email fallback) and the redirect step is
  verified live below — but actually completing a login needs a real
  GitHub OAuth App (free, 2-minute setup — see [Setup](#setup)).
- **Actually sending an email.** `lib/email.ts` degrades to logging instead
  of sending when `RESEND_API_KEY` isn't set, so the entire reminder
  pipeline (scheduling, due-detection, the "did the application move on?"
  check, marking-as-sent) is fully real and tested — only the final "hit
  Resend's API" step needs your own key.

Password auth, the state machine, role-based access, and analytics are
100% real and verified below with no caveats.

## Real, live-verified results

```
$ curl -X POST /api/auth/register -d '{"email":"alice@example.com","password":"hunter22222"}'
{"id":26,"email":"alice@example.com","name":null,"role":"MEMBER"}

$ curl -X PATCH /api/applications/17/status -d '{"status":"OFFER"}'   # SCREENING -> OFFER, skipping INTERVIEW
422 Cannot transition from SCREENING to OFFER

$ curl -X PATCH /api/applications/17/status -d '{"status":"INTERVIEW"}'
{"status":"INTERVIEW", ...}

$ curl /api/analytics
{"totalApplications":1,"byStatus":{"INTERVIEW":1,...},"responseRate":1,
 "conversion":{"appliedToScreening":1,"screeningToInterview":1,"interviewToOffer":0}}

$ curl /api/admin/applications        # as a MEMBER
403 Admin access required

$ curl /api/auth/github               # with GITHUB_CLIENT_ID configured
307 -> https://github.com/login/oauth/authorize?client_id=...&state=...
Set-Cookie: github_oauth_state=...; HttpOnly; Secure; SameSite=lax
```

All from an actual running server against real Postgres — not illustrative,
this is what running it produces.

## Setup

```bash
# Postgres + Redis
docker compose up -d          # or use existing local instances

npm install
cp .env.example .env
# JWT_SECRET: any long random string (openssl rand -base64 32)
npx prisma migrate deploy
```

**Optional — GitHub OAuth** (to actually complete a GitHub login):
register an OAuth App at github.com/settings/developers with callback URL
`http://localhost:3000/api/auth/github/callback`, then set
`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` in `.env`.

**Optional — real emails**: set `RESEND_API_KEY` from resend.com. Without
it, reminder emails are logged to the console instead of sent.

## Run it

```bash
npm run dev          # the app
npm run worker       # the reminder background worker (separate process)
```

Register an account (or click "Sign in with GitHub" if configured), add a
few applications, and move them through Applied → Screening → Interview →
Offer/Rejected.

## Run the tests

```bash
npm test
```

**58 tests**, against real Postgres + Redis, all passing. Highlights:

- `statusMachine.test.ts` — every legal and illegal transition, including
  that REJECTED is genuinely terminal and self-transitions are rejected
- `applicationService.test.ts` — creating an application produces exactly
  one Application row, one StatusChange, one Reminder, and enqueues the
  reminder job with the reminder's own id and due date
- `applicationsRoutes.test.ts` — **the ownership check**: user A cannot
  modify user B's application (404, not 403 — doesn't even confirm it
  exists), and analytics/listing are correctly scoped per-user; **the RBAC
  check**: a MEMBER gets 403 from the admin endpoint, an ADMIN gets every
  user's applications
- `reminders.test.ts` — a reminder correctly does NOT fire if the
  application already moved on since it was scheduled, and marks itself
  processed either way (sent or skipped) so it's never re-evaluated forever
- `github.test.ts` — the OAuth token exchange and profile fetch, including
  the private-email fallback to `/user/emails` and picking the verified
  primary address
- `jwt.test.ts` / `password.test.ts` — session tokens reject a wrong
  secret; passwords are salted (same password hashes differently each
  time) and never stored in plaintext

## How the state machine actually enforces itself

`lib/statusMachine.ts` is a transition table, not a comment saying "please
only move forward." `lib/applicationService.ts`'s `transitionApplicationStatus`
validates against it before writing anything, inside a transaction that
updates the `Application` row AND appends a `StatusChange` audit row
atomically — so `SCREENING -> OFFER` returns a 422 and the database is
byte-for-byte unchanged (verified in `applicationService.test.ts`: no
extra `StatusChange` row gets created from a rejected attempt). The audit
trail is what makes `lib/analytics.ts`'s conversion rates correct — see
below.

## How auth actually works (not a framework black box)

- **Password sessions**: bcrypt hash (`lib/auth/password.ts`) + a JWT
  signed with `jose` (`lib/auth/jwt.ts`), stored in an httpOnly, sameSite
  cookie. Login and "wrong password" return the identical error and status
  code (verified in `authRoutes.test.ts`) — a different message for
  "no such user" vs "wrong password" lets a caller enumerate registered
  emails.
- **GitHub OAuth**: the actual Authorization Code flow, four steps, each
  its own function in `lib/auth/github.ts`: build the authorize URL with a
  random `state` (stored in a short-lived httpOnly cookie for CSRF
  protection) → GitHub redirects back with a `code` → exchange it
  server-side for an access token → fetch the profile (falling back to
  `/user/emails` when the public email is private). The callback route
  links to an existing password account sharing the same verified email,
  rather than creating a duplicate user.
- **Route-level enforcement, not just middleware**: `middleware.ts` redirects
  unauthenticated page loads for UX, but every API route independently
  checks the session itself — a request that bypasses the page entirely
  (curl, a script, a compromised client) still can't get past the checks in
  `applications/[id]/status/route.ts` (ownership) or
  `admin/applications/route.ts` (role).

## How reminders actually get scheduled and sent

`createApplication` schedules a `Reminder` row due 7 days out and enqueues
a **delayed BullMQ job** (`lib/queue.ts`) that fires at exactly that time —
not a polling loop checking "anything due yet?" on an interval. The worker
(`src/worker/reminderWorker.ts`) re-checks the application's *current*
state before sending: if it already moved past Applied/Screening in the
meantime, the reminder is marked processed without sending anything
(`shouldSendReminder` in `lib/reminders.ts`) — so a candidate who got an
interview three days after applying doesn't get an email asking if they've
heard back.

## Analytics that account for the whole history, not just current status

An application currently at OFFER also passed through Screening and
Interview on the way there; one that went Interview → Rejected still
reached Interview before the rejection. `computeAnalytics` in
`lib/analytics.ts` computes conversion rates from each application's full
`StatusChange` history, not just its current status — counting only
current status would silently undercount every stage a since-rejected
application passed through, which is most of them. See the docstring and
`analytics.test.ts` for the specific case this matters for.

## Project layout

```
src/
  lib/
    auth/          jwt.ts, password.ts, session.ts, github.ts, oauthState.ts
    statusMachine.ts   the transition table
    applicationService.ts   createApplication, transitionApplicationStatus
    reminders.ts, email.ts, queue.ts    the reminder pipeline
    analytics.ts          history-aware funnel/conversion computation
  worker/reminderWorker.ts   the BullMQ consumer — a separate process
  middleware.ts                page-level auth redirect (UX only, not the security boundary)
  app/
    login/, dashboard/          the UI
    api/auth/                     register, login, logout, github, github/callback
    api/applications/               list, create, status transition
    api/analytics/, api/admin/        per-user analytics, role-gated admin view
tests/   58 tests against real Postgres + Redis
```

## Where this is intentionally scoped down

- **No team/organization modeling.** Role-based access here is binary
  (MEMBER/ADMIN) and global — an admin sees *everyone's* applications,
  not a scoped team. Multi-tenant teams are a natural but substantially
  larger extension.
- **One reminder per application**, scheduled at creation. Re-scheduling a
  fresh reminder after each status change (e.g. "no update since moving to
  Screening") is a reasonable next step, not built here.
- **No password reset flow.** Registration and login only.

## Known harmless build warning

`next build` prints a "module not found: @valkey/valkey-glide" warning
from BullMQ — an optional alternate Redis-client backend we don't use
(the app connects through `ioredis`, which BullMQ fully supports). Not a
bug, just noisy dependency resolution.
