# Idempotent Payment Gateway

A `POST /charges` endpoint that is safe to retry. Fire the same request
twice — or fire it ten times *simultaneously* — and exactly one charge
happens. Every caller gets back the identical response.

This is the pattern real payment APIs (Stripe, Razorpay) use, and it's the
canonical example of "this bug costs real money": a naive charge endpoint
double-charges a customer the moment their client times out and retries.

## The core idea

Every request must include an `Idempotency-Key` header. The gateway:

1. **Never charges twice for the same key.** A retry with the same key and
   the same payload replays the original response instead of processing
   again.
2. **Rejects key reuse with a different payload** (422) — this catches a
   whole class of client bugs where a key gets accidentally reused.
3. **Is actually safe under real concurrency**, not just sequential
   retries — see [How it's actually safe](#how-its-actually-safe-not-just-in-theory) below.

## Setup

You need Node 20+ and a Postgres instance. Two ways to get Postgres:

```bash
# Option A: Docker (if you have it)
docker compose up -d

# Option B: already have Postgres running locally
createdb payment_gateway
```

Then:

```bash
npm install
cp .env.example .env        # edit DATABASE_URL if you used Option B
npx prisma migrate deploy
```

## Run it

```bash
npm run dev
```

```bash
# First request — actually charges
curl -i -X POST http://localhost:3000/charges \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-1" \
  -d '{"amount": 500, "currency": "usd", "customerId": "cus_1"}'
# -> 201, Idempotent-Replayed: false

# Retry with the same key + same payload — replays, does NOT charge again
curl -i -X POST http://localhost:3000/charges \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-1" \
  -d '{"amount": 500, "currency": "usd", "customerId": "cus_1"}'
# -> 201, Idempotent-Replayed: true, identical body/charge id

# Same key, different payload — rejected
curl -i -X POST http://localhost:3000/charges \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-1" \
  -d '{"amount": 999, "currency": "usd", "customerId": "cus_1"}'
# -> 422
```

## Run the tests

```bash
npm test
```

9 tests against a **real** Postgres database (not mocks — this is a race
condition that only actually reproduces against real DB-level
constraints). The two that matter most:

- `runs the handler exactly once, even under real concurrency` — fires 20
  concurrent calls with the same key and asserts the underlying handler
  (the "charge the card" step) executed exactly once.
- `charges exactly once under real concurrent duplicate requests` — same
  property, but through the actual HTTP layer with `supertest`.

## How it's actually safe (not just in theory)

The tempting-but-wrong approach is an in-process lock (e.g. a `Map` of
in-flight promises keyed by idempotency key). That only protects a single
server instance — the moment you run two instances behind a load balancer,
two concurrent requests can land on different instances and both slip
through.

This implementation instead relies entirely on a **database unique
constraint** (`IdempotencyKey.key` in `prisma/schema.prisma`):

1. On a new key, the server tries to `INSERT` a row claiming it.
2. Postgres allows exactly one such insert to succeed when multiple
   requests race — every other insert fails with a unique-constraint
   violation (`P2002`), regardless of how many server instances are
   involved.
3. The winner does the actual work (calls the payment processor) and then
   updates its row to `completed` with the response.
4. Every loser catches its constraint violation, then polls the row until
   it reaches `completed`, and replays that response.

See `src/idempotency.ts` — `withIdempotency()` is the entire mechanism, in
about 40 lines, independent of Express (it's tested directly, with no HTTP
layer, in `tests/idempotency.test.ts`).

Note the claim-row-then-do-work-outside-a-transaction shape is deliberate:
holding a database row lock for the entire duration of a call to an
external payment processor would tie up a DB connection for as long as
that network call takes, and one slow/hung processor call would then start
starving other requests of DB connections. Claiming the key via a fast,
one-line insert and doing the slow work afterward avoids that.

## Project layout

```
src/
  server.ts          Express app + the POST /charges route
  idempotency.ts      withIdempotency() — the actual mechanism, framework-agnostic
  processor.ts         FakeProcessor — stands in for Stripe/etc, with simulated latency
  prismaClient.ts        Prisma client singleton
  errors.ts               IdempotencyConflictError
prisma/schema.prisma    IdempotencyKey (generic) + Charge (this endpoint's record)
tests/
  idempotency.test.ts    core mechanism, direct calls, includes the concurrency test
  charges.route.test.ts   HTTP-level tests via supertest
```

## Where this is intentionally scoped down

- **No real payment processor.** `FakeProcessor` simulates latency and
  failure (`amount <= 0`) but doesn't call Stripe. Swapping it for a real
  one only touches `processor.ts`.
- **No Redis.** The brief for this project lists Redis as an optional
  cache layer in front of Postgres for lower read latency on replayed
  responses. Skipped here because Postgres's unique constraint is what
  provides *correctness* — Redis would only be a performance optimization
  on top of a mechanism that already works, and this project is scoped to
  the mechanism itself.
- **No webhook delivery.** Real payment gateways also need idempotent,
  retry-safe webhook *delivery* to the merchant (the same double-delivery
  problem, in the opposite direction). Good "what would you add next"
  material for an interview.
